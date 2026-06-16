# rebuild-review-index.ps1 -- regenerate review/index.html from manifest
# Called by publish-review.ps1 and close-review.ps1. Can be run standalone.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
$ManifestPath = Join-Path $RepoRoot "review/.review-manifest.json"
$IndexPath = Join-Path $RepoRoot "review/index.html"

$manifest = if (Test-Path $ManifestPath) {
    @(Get-Content $ManifestPath -Raw | ConvertFrom-Json)
} else { @() }

# Active = not archived, not closed
$active = @($manifest | Where-Object { -not $_.archived -and -not $_.closed })
$today = Get-Date

$cards = ""
foreach ($item in $active) {
    $created = [datetime]::ParseExact($item.created, "yyyy-MM-dd", $null)
    $age = ($today - $created).Days
    $staleClass = if ($age -gt 10) { " stale" } else { "" }
    $dateLabel = "Created $($item.created)"
    if ($age -gt 13) { $dateLabel += " — auto-close pending" }
    $cards += @"

    <a class="review-card$staleClass" href="/review/$($item.slug)/">
      <div class="meta">
        <div class="title">$($item.title)</div>
        <div class="date">$dateLabel</div>
      </div>
      <div class="arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></div>
    </a>
"@
}

if (-not $cards) {
    $cards = '    <div class="empty">No active reviews.</div>'
}

$html = Get-Content $IndexPath -Raw -Encoding UTF8

# Marker-based replace. Cards live strictly between START/END markers so the replace
# can never silently no-op. The old regex needed >=3 trailing </div> and quietly
# matched nothing on a single-card list, leaving the hub stale (incident 2026-06-16).
$startMarker = '    <!-- REVIEW_CARDS_START -->'
$endMarker   = '    <!-- REVIEW_CARDS_END -->'
if ($html -notmatch [regex]::Escape($startMarker) -or $html -notmatch [regex]::Escape($endMarker)) {
    Write-Error "review/index.html is missing REVIEW_CARDS_START/END markers. Refusing to write a stale hub. Restore the markers, then re-run."
    exit 1
}
$replacement = "$startMarker$cards`n$endMarker"
$pattern = '(?s)' + [regex]::Escape($startMarker) + '.*?' + [regex]::Escape($endMarker)
$newHtml = [regex]::Replace($html, $pattern, { param($m) $replacement })
Set-Content $IndexPath $newHtml -Encoding UTF8

# Verify the written hub card count matches the active manifest count, or fail loud.
$written = ([regex]::Matches((Get-Content $IndexPath -Raw), 'class="review-card"')).Count
if ($written -ne $active.Count) {
    Write-Error "Hub card mismatch: wrote $written cards but manifest has $($active.Count) active. Do NOT deploy."
    exit 1
}
Write-Host "review/index.html rebuilt ($($active.Count) active reviews, $written cards verified)."
