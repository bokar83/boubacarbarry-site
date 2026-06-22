# rebuild-review-index.ps1 -- regenerate review/index.html from the review/ directory.
# Called by publish-review.ps1, close-review.ps1, prune-reviews.ps1. Runs standalone.
#
# Three hardening mechanisms make the hub maintain itself (2026-06-21):
#   1. SELF-POPULATE  : scans review/<slug>/index.html and auto-adds any folder missing
#                       from the manifest, so a new review page lists WITHOUT a manual
#                       manifest edit. Curated fields (keep, title, closed, archived) are
#                       MERGED, never clobbered. Removed non-archived folders are pruned.
#   2. AUTO-ARCHIVE   : items older than $ArchiveAfterDays (by date) auto-move to
#                       review/archive/<slug>/ (files NEVER deleted), archived=true, and
#                       render in the collapsed "Archived" section. keep:true is exempt.
#   3. KEEP / PIN     : keep:true entries pin to the TOP with a "Kept" badge and never
#                       auto-archive. The manifest is the durable source of truth.
#
# -Check : sync-check only (no writes). Exits 1 if the manifest is out of sync with the
#          review/ directory OR an item is overdue for archive. CI uses this to fail a
#          stale push.

param([switch]$Check)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
$ReviewDir = Join-Path $RepoRoot "review"
$ManifestPath = Join-Path $ReviewDir ".review-manifest.json"
$IndexPath = Join-Path $ReviewDir "index.html"
$ArchiveDir = Join-Path $ReviewDir "archive"

$ArchiveAfterDays = 21   # non-keep items older than this auto-archive

# Folders that are NOT review cards: demo/sample pages and the archive bin.
$ExcludePrefixes = @('sample-')
$ExcludeExact = @('archive')

$today = Get-Date

# --- Helpers ----------------------------------------------------------------
function Test-Keep($item) {
    return (($item.PSObject.Properties.Name -contains 'keep') -and $item.keep)
}

function Get-PageTitle([string]$indexFile, [string]$slug) {
    try { $html = Get-Content $indexFile -Raw -Encoding UTF8 }
    catch { return ($slug -replace '-', ' ') }
    # Prefer <title>, strip any " | Boubacar" style suffix; fall back to first <h1>.
    if ($html -match '(?is)<title>\s*(.*?)\s*</title>') {
        $t = ($Matches[1].Trim() -split '\s*\|\s*')[0].Trim()
        if ($t) { return $t }
    }
    if ($html -match '(?is)<h1[^>]*>\s*(.*?)\s*</h1>') {
        $t = ($Matches[1] -replace '<[^>]+>', '').Trim()
        if ($t) { return $t }
    }
    return ($slug -replace '-', ' ')
}

function Get-FolderDate([string]$slug, [string]$folderPath) {
    if ($slug -match '^(\d{4})(\d{2})(\d{2})-') {
        return "$($Matches[1])-$($Matches[2])-$($Matches[3])"
    }
    return (Get-Item $folderPath).LastWriteTime.ToString("yyyy-MM-dd")
}

function Format-Card($item, [bool]$isArchived) {
    $isKeep = Test-Keep $item
    $created = [datetime]::ParseExact($item.created, "yyyy-MM-dd", $null)
    $age = ($today - $created).Days
    $classes = "review-card"
    if ($isKeep) { $classes += " kept" }
    if ($isArchived) {
        $dateLabel = "Archived (was $($item.created))"
    } elseif ($isKeep) {
        $dateLabel = "Permanent (kept)"
    } else {
        if ($age -gt 10) { $classes += " stale" }
        $dateLabel = "Created $($item.created)"
        $remaining = $ArchiveAfterDays - $age
        if ($remaining -le 3 -and $remaining -ge 0) { $dateLabel += " -- archives in ${remaining}d" }
    }
    $pin = if ($isKeep -and -not $isArchived) { ' <span class="pin">Kept</span>' } else { "" }
    if ($isArchived) {
        $actions = '<button class="rc-btn unarch" type="button" data-act="unarchive" data-slug="' + $item.slug + '">Restore</button>'
    } else {
        $keepLabel = if ($isKeep) { 'Kept' } else { 'Keep' }
        $keepOn = if ($isKeep) { ' on' } else { '' }
        $actions = '<button class="rc-btn keep' + $keepOn + '" type="button" data-act="keep" data-slug="' + $item.slug + '">' + $keepLabel + '</button>' +
                   '<button class="rc-btn arch" type="button" data-act="archive" data-slug="' + $item.slug + '">Archive</button>'
    }
    return @"

    <div class="$classes" data-slug="$($item.slug)">
      <a class="rc-link" href="/review/$($item.slug)/">
        <div class="meta">
          <div class="title">$($item.title)$pin</div>
          <div class="date">$dateLabel</div>
        </div>
        <div class="arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>
      </a>
      <div class="rc-actions">$actions</div>
    </div>
"@
}

function Replace-Block([string]$html, [string]$startMarker, [string]$endMarker, [string]$inner) {
    if ($html -notmatch [regex]::Escape($startMarker) -or $html -notmatch [regex]::Escape($endMarker)) {
        Write-Error "review/index.html is missing $startMarker / $endMarker markers. Refusing to write a stale hub. Restore the markers, then re-run."
        exit 1
    }
    $replacement = "$startMarker$inner`n$endMarker"
    $pattern = '(?s)' + [regex]::Escape($startMarker) + '.*?' + [regex]::Escape($endMarker)
    return [regex]::Replace($html, $pattern, { param($m) $replacement })
}

# --- Load existing manifest -------------------------------------------------
$manifest = if (Test-Path $ManifestPath) {
    @(Get-Content $ManifestPath -Raw | ConvertFrom-Json)
} else { @() }

$bySlug = @{}
foreach ($e in $manifest) { $bySlug[$e.slug] = $e }

# --- Scan disk and self-populate --------------------------------------------
$diskSlugs = @{}
$added = @()
if (Test-Path $ReviewDir) {
    foreach ($dir in (Get-ChildItem $ReviewDir -Directory)) {
        $slug = $dir.Name
        if ($ExcludeExact -contains $slug) { continue }
        $skip = $false
        foreach ($p in $ExcludePrefixes) { if ($slug.StartsWith($p)) { $skip = $true; break } }
        if ($skip) { continue }
        $indexFile = Join-Path $dir.FullName "index.html"
        if (-not (Test-Path $indexFile)) { continue }   # not a publishable review page

        $diskSlugs[$slug] = $true
        if (-not $bySlug.ContainsKey($slug)) {
            $entry = [PSCustomObject]@{
                slug     = $slug
                title    = (Get-PageTitle $indexFile $slug)
                created  = (Get-FolderDate $slug $dir.FullName)
                closed   = $null
                archived = $false
            }
            $manifest += $entry
            $bySlug[$slug] = $entry
            $added += $slug
        }
    }
}

# Non-archived manifest entries whose folder is gone. A live archive/<slug>/ folder means
# it was archived (status drift -> reconcile to archived). No folder anywhere means the
# page was removed -> prune the dead entry so no broken card renders.
$ghostArchived = @()   # folder moved to archive/ but manifest still says active
$ghostRemoved = @()    # folder gone entirely -> drop from manifest
foreach ($e in $manifest) {
    if ($ExcludeExact -contains $e.slug) { continue }
    if ($e.archived) { continue }
    if ($diskSlugs.ContainsKey($e.slug)) { continue }
    if (Test-Path (Join-Path $ArchiveDir $e.slug)) { $ghostArchived += $e.slug }
    else { $ghostRemoved += $e.slug }
}

# --- Auto-archive sweep: non-keep, not yet archived, older than cutoff -------
$toArchive = @()
foreach ($e in $manifest) {
    if ($e.archived) { continue }
    if (Test-Keep $e) { continue }
    if (-not $diskSlugs.ContainsKey($e.slug)) { continue }   # only archive live folders
    $created = [datetime]::ParseExact($e.created, "yyyy-MM-dd", $null)
    if (($today - $created).Days -gt $ArchiveAfterDays) { $toArchive += $e.slug }
}

# --- Sync-check mode (CI gate): no writes, fail loud on drift ----------------
if ($Check) {
    $problems = @()
    if ($added.Count -gt 0)         { $problems += "Folders on disk missing from manifest: $($added -join ', '). Run rebuild-review-index.ps1 and commit." }
    if ($ghostRemoved.Count -gt 0)  { $problems += "Manifest entries with no folder anywhere (stale cards): $($ghostRemoved -join ', ')." }
    if ($ghostArchived.Count -gt 0) { $problems += "Entries in review/archive/ still marked active: $($ghostArchived -join ', ')." }
    if ($toArchive.Count -gt 0)     { $problems += "Items overdue for auto-archive (> $ArchiveAfterDays d): $($toArchive -join ', '). Run rebuild-review-index.ps1." }
    if ($problems.Count -gt 0) {
        foreach ($p in $problems) { Write-Error $p -ErrorAction Continue }
        exit 1
    }
    Write-Host "review/ index is in sync (no drift, nothing overdue for archive)."
    exit 0
}

# --- Apply mutations (archive moves never delete: move to review/archive/) ---
$manifestChanged = $false

foreach ($slug in $ghostRemoved) {
    $manifest = @($manifest | Where-Object { $_.slug -ne $slug })
    $manifestChanged = $true
    Write-Host "Pruned dead manifest entry (no folder): $slug"
}
$bySlug = @{}; foreach ($e in $manifest) { $bySlug[$e.slug] = $e }

foreach ($slug in $ghostArchived) {
    $bySlug[$slug].archived = $true
    $manifestChanged = $true
    Write-Host "Reconciled to archived (folder already in archive/): $slug"
}

foreach ($slug in $toArchive) {
    $srcDir = Join-Path $ReviewDir $slug
    $dstDir = Join-Path $ArchiveDir $slug
    if (Test-Path $srcDir) {
        New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
        Copy-Item "$srcDir/*" $dstDir -Recurse -Force
        Remove-Item $srcDir -Recurse -Force
    }
    $bySlug[$slug].archived = $true
    $manifestChanged = $true
    Write-Host "AUTO-ARCHIVED (> $ArchiveAfterDays d): $slug"
}

if ($added.Count -gt 0) {
    $manifestChanged = $true
    Write-Host "Manifest self-populated: added $($added -join ', ')."
}

if ($manifestChanged) {
    $manifest | ConvertTo-Json -Depth 3 | Set-Content $ManifestPath -Encoding UTF8
}

# --- Partition + order ------------------------------------------------------
# Active = not archived, not closed. Kept items pin to the top (then by date desc).
$active = @($manifest | Where-Object { -not $_.archived -and -not $_.closed })
$activeSorted = @($active | Sort-Object @{ Expression = { if (Test-Keep $_) { 0 } else { 1 } } }, @{ Expression = { $_.created }; Descending = $true })
$archivedItems = @($manifest | Where-Object { $_.archived } | Sort-Object @{ Expression = { $_.created }; Descending = $true })

# --- Build card blocks ------------------------------------------------------
$cards = ""
foreach ($item in $activeSorted) { $cards += (Format-Card $item $false) }
if (-not $cards) { $cards = "`n    <div class=`"empty`">No active reviews.</div>" }

$archivedCards = ""
foreach ($item in $archivedItems) { $archivedCards += (Format-Card $item $true) }
if (-not $archivedCards) { $archivedCards = "`n    <div class=`"empty`">Nothing archived yet.</div>" }

# --- Write index.html (marker-based, can never silently no-op) ---------------
$html = Get-Content $IndexPath -Raw -Encoding UTF8
$html = Replace-Block $html '    <!-- REVIEW_CARDS_START -->'    '    <!-- REVIEW_CARDS_END -->'    $cards
$html = Replace-Block $html '    <!-- REVIEW_ARCHIVED_START -->' '    <!-- REVIEW_ARCHIVED_END -->' $archivedCards
Set-Content $IndexPath $html -Encoding UTF8

# --- Verify written card counts match, or fail loud -------------------------
$writtenAll = ([regex]::Matches((Get-Content $IndexPath -Raw), 'class="review-card[^"]*"')).Count
$expected = $activeSorted.Count + $archivedItems.Count
if ($writtenAll -ne $expected) {
    Write-Error "Hub card mismatch: wrote $writtenAll cards but expected $expected (active $($activeSorted.Count) + archived $($archivedItems.Count)). Do NOT deploy."
    exit 1
}
Write-Host "review/index.html rebuilt ($($activeSorted.Count) active, $($archivedItems.Count) archived, $writtenAll cards verified)."
