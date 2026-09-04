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
#   version: "v3", "3", or omitted. When omitted, AUTO-BUMPS: reads the file's existing
#   stamp (if any) and increments the numeric version by 1, rather than resetting to v1.
#   This closes the original failure mode (SYS-fix 2026-08-29, money-map-y0 sat at v17
#   through an unrelated same-day fix because the caller has to remember to pass a bumped
#   number by hand, and on a page that is edited by direct commit rather than through
#   publish-review.ps1, nobody was calling this script at all). A file with no existing
#   stamp still defaults to v1 on first run.

param(
    [Parameter(Mandatory)][string]$HtmlFile,
    [string]$Version
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path $HtmlFile)) {
    Write-Error "HTML file not found: $HtmlFile"
    exit 1
}

$VersionExplicit = $PSBoundParameters.ContainsKey('Version') -and [bool]$Version

if (-not $VersionExplicit) {
    # Auto-bump: pull the numeric version out of the file's current stamp, +1.
    $existingRaw = Get-Content $HtmlFile -Raw -Encoding UTF8
    $bumped = 1
    # Match "...>v17 <anything>2026-..." -- deliberately agnostic about the separator
    # character (middle-dot vs its HTML entity vs anything else) since only the leading
    # v-number matters here.
    if ($existingRaw -match '(?s)<!-- DEPLOY_STAMP_START -->.*?>\s*v(\d+)\b') {
        $bumped = [int]$Matches[1] + 1
    }
    $Version = "v$bumped"
    Write-Host "No -Version passed -- auto-bumped from existing stamp to $Version."
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
# COLLISION FIX 2026-08-11 (SYS-508): the stamp is position:fixed at z-index 99999, so at
# 375px it sat on top of the sticky section nav -- observed twice the same day on two
# different pages. Under 560px it now moves to the BOTTOM-LEFT corner, which is the one
# corner nothing else claims (the floating back-to-top / fold controls injected by
# inject-review-furniture.ps1 live bottom-RIGHT, the nav lives top). Desktop is unchanged:
# still upper-right, per the standing version-stamp hard rule.
#
# COLLISION FIX 2026-09-04 (first attempt, since found still broken): moving the pill to
# bottom-left only dodged the OLD collision (the mobile hamburger button); it did not
# create a clear zone, because body copy is normal-flow and scrolls through that corner at
# every scroll depth, not just at page-end. The first attempt tried to paper over this with
# a scroll-based opacity fade (near-invisible once scrolled, full opacity near the top) --
# but a real 375x812 screenshot taken AT PAGE LOAD (scrollY 0, the exact moment the fade
# logic keeps it at full opacity "because that is the only moment verify-at-a-glance needs
# it") caught it sitting fully opaque directly on top of body text, because scrollY 0 is
# also the moment content is guaranteed to be right there. Fading opacity never fixes an
# overlap; it only changes how visible the overlap is.
#
# REAL FIX 2026-09-04: stop fighting position:fixed with scroll heuristics. Under 560px the
# stamp is no longer fixed at all -- it renders IN NORMAL DOCUMENT FLOW as its own line at
# the very top of <body>, before the nav bar, so it physically cannot sit on top of
# anything; the page just gets ~20px taller. This is a structural guarantee, not a
# probability, and it needs no JS: the scroll-listener script that drove the old fade is
# removed entirely. Desktop is unchanged: still upper-right, fixed, constant full opacity,
# inside the sticky nav bar's own opaque strip (which has always been collision-free,
# because that chrome papers over whatever scrolls beneath it).
$stampHtml = $startMarker +
    '<style id="deploy-stamp-css">' +
    '@media (max-width:560px){#deploy-stamp{position:static !important;display:block;' +
    'top:auto !important;right:auto !important;bottom:auto !important;left:auto !important;' +
    'width:auto;max-width:calc(100% - 20px);margin:6px 10px 0;}}' +
    '@media print{#deploy-stamp{position:static !important;}}</style>' +
    '<div id="deploy-stamp" style="position:fixed;top:8px;right:10px;z-index:99999;' +
    "font-family:ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;" +
    'font-size:11px;line-height:1;color:rgba(165,151,131,0.78);' +
    'background:rgba(20,18,16,0.72);border:1px solid rgba(236,226,210,0.14);' +
    'border-radius:6px;padding:4px 8px;letter-spacing:0.02em;' +
    'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);pointer-events:none;' +
    'user-select:none;white-space:nowrap;">' + $label + '</div>' +
    $endMarker

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
