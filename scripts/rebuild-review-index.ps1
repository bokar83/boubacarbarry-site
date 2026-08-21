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
#   4. PINNED ORDER (2026-08-07): kept items additionally support an optional integer
#                       "pinned_order" field in review/.review-manifest.json. When set on
#                       a kept item, that item renders FIRST within the Kept block, in
#                       ascending numeric order (1 before 2 before 3, gaps are fine).
#                       Kept items without pinned_order keep the previous date-desc order,
#                       rendering beneath the numbered ones. pinned_order on a non-kept
#                       item has no effect -- ordering only applies inside the Kept block.
#                       This is CHAT-DRIVEN, not a UI control: to reorder, open
#                       review/.review-manifest.json, find the item by "slug", add or
#                       change its "pinned_order": <int> field (add "pinned_order": 1 to
#                       one item and "pinned_order": 2 to another to put the first one
#                       above the second), save, commit. The next run of this script (or
#                       publish-review.ps1 / close-review.ps1 / prune-reviews.ps1, which
#                       all call it automatically) re-renders the hub with the new order.
#                       No Supabase write needed -- this lives in the git-tracked manifest
#                       only, same as "keep" itself.
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

function Test-DbKept([string]$slug) {
    return ($dbStates.ContainsKey($slug) -and $dbStates[$slug].kept)
}

# Effective archived state = the human Keep/Archive decision in review_states (if a
# row exists) overlaid on the manifest lifecycle flag. An explicit un-archive is only
# honored while the page folder is still live under review/<slug>/ (a folder already
# moved to review/archive/ would render a broken card link).
function Get-EffArchived($item) {
    $slug = $item.slug
    if ($dbStates.ContainsKey($slug)) {
        if ($dbStates[$slug].archived) { return $true }
        if ($diskSlugs.ContainsKey($slug)) { return $false }
    }
    return [bool]$item.archived
}

function Get-EffKept($item) {
    return ((Test-Keep $item) -or (Test-DbKept $item.slug))
}

# Manual display-order override for KEPT items only (see PINNED ORDER header note).
# Returns $null when unset or when the item is not effectively kept, so callers can
# treat $null as "fall back to date-desc" with a single check.
function Get-PinnedOrder($item) {
    if (-not (Get-EffKept $item)) { return $null }
    if ($item.PSObject.Properties.Name -notcontains 'pinned_order') { return $null }
    if ($null -eq $item.pinned_order -or $item.pinned_order -eq '') { return $null }
    return [int]$item.pinned_order
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
    $isKeep = Get-EffKept $item
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
    # SVG glyphs: bookmark (keep), box-arrow (archive), undo (restore). Stroke = currentColor.
    $svgKeep = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5V21l-7-4.2L5 21V4.5z"/></svg>'
    $svgArch = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>'
    $svgUnarch = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.3-9.3L3 7"/></svg>'
    # Single state indicator = the Keep pill (filled when kept). No duplicate text badge by the title.
    if ($isArchived) {
        $actions = '<button class="rc-btn unarch" type="button" data-act="unarchive" data-slug="' + $item.slug + '" aria-label="Restore" title="Restore to active">' + $svgUnarch + '<span class="lbl">Restore</span></button>'
    } else {
        $keepLabel = if ($isKeep) { 'Kept' } else { 'Keep' }
        $keepOn = if ($isKeep) { ' on' } else { '' }
        $keepAria = if ($isKeep) { 'Kept (click to unpin)' } else { 'Keep (pin to top)' }
        $actions = '<button class="rc-btn keep' + $keepOn + '" type="button" data-act="keep" data-slug="' + $item.slug + '" aria-pressed="' + $(if ($isKeep) { 'true' } else { 'false' }) + '" aria-label="' + $keepAria + '" title="' + $keepAria + '">' + $svgKeep + '<span class="lbl">' + $keepLabel + '</span></button>' +
                   '<button class="rc-btn arch" type="button" data-act="archive" data-slug="' + $item.slug + '" aria-label="Archive" title="Archive (hide)">' + $svgArch + '<span class="lbl">Archive</span></button>'
    }
    return @"

    <div class="$classes" data-slug="$($item.slug)">
      <a class="rc-link" href="/review/$($item.slug)/">
        <div class="meta">
          <div class="title">$($item.title)</div>
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
# -Encoding UTF8 is LOAD-BEARING (fixed 2026-08-21). Without it, Windows PowerShell 5.1
# reads this UTF-8 file as ANSI/cp1252, so every non-ASCII char (an em-dash, in practice)
# comes back as mojibake -- and line ~296 then writes it back out as real UTF-8. That is a
# lossy round trip that COMPOUNDS one generation per rebuild: 17 of 225 manifest titles had
# decayed into multi-hundred-character garbage, e.g. "HR Revenue Plan <300 chars of noise>
# Sequenced Go-To-Market". A title he cannot read is a title he cannot find, so this is a
# findability bug, not a cosmetic one. Repaired titles were restored in the same commit.
$manifest = if (Test-Path $ManifestPath) {
    @(Get-Content $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json)
} else { @() }

$bySlug = @{}
foreach ($e in $manifest) { $bySlug[$e.slug] = $e }

# --- Load cross-device decisions from Supabase review_states -----------------
# The hub UI writes Keep/Archive decisions to this table (public publishable key with
# RLS public_rw -- the same key already embedded in the public hub page, not a secret).
# The generator MERGES these decisions into the render so a rebuild/republish can never
# reset a decision made on any device. Fetch failure = warn + manifest-only render
# (never fatal, never writes over the DB).
$SupaUrl = 'https://jscucboftaoaphticqci.supabase.co'
$SupaKey = 'sb_publishable_MxzgX_TRIJha-vU8xAjWdA_aMry3E5S'
$SupaHdr = @{ apikey = $SupaKey; Authorization = "Bearer $SupaKey" }
$dbStates = @{}
try {
    $rows = Invoke-RestMethod -Uri "$SupaUrl/rest/v1/review_states?select=slug,kept,archived" -Headers $SupaHdr -TimeoutSec 20
    foreach ($r in @($rows)) { $dbStates[$r.slug] = $r }
    Write-Host "review_states: loaded $($dbStates.Count) decision rows from Supabase."
} catch {
    Write-Warning "review_states fetch failed ($($_.Exception.Message)); rendering manifest-only."
}

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
    if (Test-DbKept $e.slug) { continue }   # kept via the hub UI -- never auto-archive
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

# Write the 21-day sweep result back to review_states so the DB and the manifest
# converge (otherwise a stale archived=false row would re-activate a swept item).
if ($toArchive.Count -gt 0) {
    try {
        $wb = @($toArchive | ForEach-Object { @{ slug = $_; kept = $false; archived = $true; updated_at = (Get-Date).ToUniversalTime().ToString('o') } })
        $wbHdr = $SupaHdr + @{ 'Content-Type' = 'application/json'; Prefer = 'resolution=merge-duplicates' }
        Invoke-RestMethod -Method Post -Uri "$SupaUrl/rest/v1/review_states" -Headers $wbHdr -Body (ConvertTo-Json $wb -Depth 3) -TimeoutSec 20 | Out-Null
        Write-Host "review_states: wrote back archived=true for $($toArchive -join ', ')."
    } catch {
        Write-Warning "review_states write-back failed ($($_.Exception.Message)); the client will still show these as archived from the manifest."
    }
}

# --- Partition + order ------------------------------------------------------
# Active = not archived (manifest lifecycle MERGED with review_states decisions),
# not closed. Kept items pin to the top. Within the Kept block, items with an explicit
# pinned_order render first in ascending numeric order; remaining Kept items (and all
# non-Kept items below them) keep the previous date-desc order. See PINNED ORDER header
# note for how pinned_order gets set.
$active = @($manifest | Where-Object { -not (Get-EffArchived $_) -and -not $_.closed })
$activeSorted = @($active | Sort-Object `
    @{ Expression = { if (Get-EffKept $_) { 0 } else { 1 } } }, `
    @{ Expression = { if ($null -ne (Get-PinnedOrder $_)) { 0 } else { 1 } } }, `
    @{ Expression = { $po = Get-PinnedOrder $_; if ($null -ne $po) { $po } else { [int]::MaxValue } } }, `
    @{ Expression = { $_.created }; Descending = $true })
$archivedItems = @($manifest | Where-Object { Get-EffArchived $_ } | Sort-Object @{ Expression = { $_.created }; Descending = $true })

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

# IDEMPOTENT WRITE (2026-08-06). This used to be `Set-Content $IndexPath $html -Encoding UTF8`,
# which is NOT a round-trip: Get-Content -Raw keeps the newline already at the end of the file
# and Set-Content then appends its own, so every rebuild grew index.html by one blank line even
# when nothing had changed. That made the scheduled sweep produce a diff and push a commit to
# main on EVERY tick (~24 junk commits/day once the cron went hourly), and it made "did anything
# change?" a useless signal for any workflow trying to commit only real changes. Normalising to
# exactly one trailing LF and writing the bytes directly makes a no-op rebuild byte-identical.
# WriteAllText (rather than Set-Content) also pins the encoding to UTF-8 no-BOM regardless of
# whether this runs under Windows PowerShell 5.1 (Set-Content UTF8 = BOM) or pwsh 7 (no BOM),
# so a local rebuild and a CI rebuild can never flip the BOM back and forth.
$html = ($html -replace '(\r?\n)+\z', '') + "`n"
[System.IO.File]::WriteAllText($IndexPath, $html, [System.Text.UTF8Encoding]::new($false))

# --- Verify written card counts match, or fail loud -------------------------
$writtenAll = ([regex]::Matches((Get-Content $IndexPath -Raw), 'class="review-card[^"]*"')).Count
$expected = $activeSorted.Count + $archivedItems.Count
if ($writtenAll -ne $expected) {
    Write-Error "Hub card mismatch: wrote $writtenAll cards but expected $expected (active $($activeSorted.Count) + archived $($archivedItems.Count)). Do NOT deploy."
    exit 1
}
Write-Host "review/index.html rebuilt ($($activeSorted.Count) active, $($archivedItems.Count) archived, $writtenAll cards verified)."
