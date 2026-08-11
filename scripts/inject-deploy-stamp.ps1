# inject-deploy-stamp.ps1 -- stamp a review HTML file with a version + deploy timestamp.
#
# HARD RULE (feedback_review_pages_version_deploy_stamp, 2026-06-26):
#   Every boubacarbarry.com/review/* page MUST show, in the UPPER-RIGHT corner,
#   a version number + last-deploy timestamp in YYYY-MM-DD-HH:mm:ss (America/Denver / MT).
#   Purpose: verify at a glance whether a redeploy actually took vs a stale cache.
#
# This is the single source of truth for the stamp. publish-review.ps1 calls it on
# every publish so no one can forget. Idempotent: re-running strips the old stamp and
# writes a fresh one (refreshed timestamp), so it is safe to run repeatedly.
#
# Usage: .\scripts\inject-deploy-stamp.ps1 <path-to-html-file> [<version>]
#   version: "v3", "3", or omitted (defaults to v1). A bare number gets a "v" prefix.

param(
    [Parameter(Mandatory)][string]$HtmlFile,
    [string]$Version = "v1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path $HtmlFile)) {
    Write-Error "HTML file not found: $HtmlFile"
    exit 1
}

# Normalize version -> always "v<n>" form.
$ver = $Version.Trim()
if ($ver -notmatch '^[vV]') { $ver = "v$ver" }
$ver = $ver.ToLower()

# Timestamp in TRUE America/Denver time, converted from UTC so it is correct no matter
# what timezone the build/deploy box runs in. (Bug fixed 2026-06-26: the deploy box runs
# UTC, so the old "assume the box is MT" stamp showed a UTC time mislabeled "MT", e.g.
# 20:55 instead of the real 14:55. TimeZoneInfo handles MST/MDT (DST) automatically.)
$utcNow = [DateTime]::UtcNow
try {
    $denverTz = [System.TimeZoneInfo]::FindSystemTimeZoneById('America/Denver')        # Linux / pwsh
} catch {
    $denverTz = [System.TimeZoneInfo]::FindSystemTimeZoneById('Mountain Standard Time') # Windows id (DST-aware)
}
$mtNow = [System.TimeZoneInfo]::ConvertTimeFromUtc($utcNow, $denverTz)
$stamp = $mtNow.ToString("yyyy-MM-dd-HH:mm:ss") + " MT"
$label = "$ver " + [char]0x00B7 + " $stamp"   # e.g. "v3 . 2026-06-26-13:52:47 MT" (middle-dot separator)

$startMarker = "<!-- DEPLOY_STAMP_START -->"
$endMarker   = "<!-- DEPLOY_STAMP_END -->"

# Subtle mono pill, upper-right, fixed. Readable on the dark review palette; pointer-events
# none so it never blocks toggles/nav/back-to-top underneath it.
#
# COLLISION FIX 2026-08-11 (SYS-473): the stamp is position:fixed at z-index 99999, so at
# 375px it sat on top of the sticky section nav -- observed twice the same day on two
# different pages. Under 560px it now moves to the BOTTOM-LEFT corner, which is the one
# corner nothing else claims (the floating back-to-top / fold controls injected by
# inject-review-furniture.ps1 live bottom-RIGHT, the nav lives top). Desktop is unchanged:
# still upper-right, per the standing version-stamp hard rule.
$stampHtml = $startMarker +
    '<style id="deploy-stamp-css">@media (max-width:560px){#deploy-stamp{top:auto !important;' +
    'right:auto !important;bottom:10px !important;left:10px !important;}}' +
    '@media print{#deploy-stamp{position:static !important;}}</style>' +
    '<div id="deploy-stamp" style="position:fixed;top:8px;right:10px;z-index:99999;' +
    "font-family:ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;" +
    'font-size:11px;line-height:1;color:rgba(165,151,131,0.78);' +
    'background:rgba(20,18,16,0.72);border:1px solid rgba(236,226,210,0.14);' +
    'border-radius:6px;padding:4px 8px;letter-spacing:0.02em;' +
    'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);pointer-events:none;' +
    'user-select:none;white-space:nowrap;">' + $label + '</div>' + $endMarker

$html = Get-Content $HtmlFile -Raw -Encoding UTF8

# Strip any existing stamp (idempotent re-publish).
$html = [regex]::Replace($html, '(?s)' + [regex]::Escape($startMarker) + '.*?' + [regex]::Escape($endMarker), '')

# Inject immediately after the opening <body ...> tag.
if ($html -match '(?i)<body[^>]*>') {
    $html = [regex]::Replace($html, '(?i)(<body[^>]*>)', '$1' + "`n" + $stampHtml, 1)
} else {
    Write-Error "No <body> tag found in $HtmlFile -- cannot inject deploy stamp."
    exit 1
}

Set-Content $HtmlFile $html -Encoding UTF8

# Verify it landed.
$check = Get-Content $HtmlFile -Raw -Encoding UTF8
if ($check -notmatch [regex]::Escape($label)) {
    Write-Error "Deploy stamp injection failed verification for $HtmlFile."
    exit 1
}
Write-Host "Stamped $HtmlFile -> $label"
