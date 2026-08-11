# validate-review-page.ps1 -- the MECHANICAL gate for the review-page layout hard standard.
#
# This is the single source of truth for "is this page compliant". publish-review.ps1 calls
# it on every publish and REFUSES to ship a failing page; audit-review-pages.ps1 calls it in
# a loop to score the pages already live. Do not re-implement these checks anywhere else.
#
# WHY THIS FILE EXISTS AT ALL: the layout rules have been written down since 2026-07-08,
# restated 07-28, sharpened 08-05, and restated AGAIN 08-11 -- and pages still shipped
# non-compliant every single time. A rule in a document is what we already had. This is the
# same rule expressed as an exit code.
#
# THE FIVE RULES (Boubacar, verbatim, 2026-08-11):
#   1. TL;DR at the very top, sections underneath it.
#   2. The TL;DR itself is collapsible.
#   3. Every section collapsible with a toggle.
#   4. A back-to-top button on every page.
#   5. Hamburger nav on mobile, normal nav on desktop, floating if practical.
# Plus the standing version/deploy stamp requirement (auto-injected, confirmed here).
#
# Rules 4 and part of the fast-re-entry behaviour are AUTO-INJECTED by
# inject-review-furniture.ps1, so they are confirmed here rather than nagged about.
# Rules 1, 2, 3 and 5 need real page structure and are hard failures.
#
# Usage:
#   .\scripts\validate-review-page.ps1 <path-to-html-file> [-Quiet]
# Exit codes: 0 = compliant (warnings allowed), 1 = non-compliant, 2 = file unreadable.
# Also emits a result object to the pipeline so callers can inspect .Pass/.Failures.

param(
    [Parameter(Mandatory)][string]$HtmlFile,
    [switch]$Quiet
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Strip-Tags([string]$s) {
    if ($null -eq $s) { return "" }
    return ([regex]::Replace($s, '<[^>]*>', '')).Trim() -replace '\s+', ' '
}

if (-not (Test-Path $HtmlFile)) {
    if (-not $Quiet) { Write-Error "File not found: $HtmlFile" }
    exit 2
}

$raw = Get-Content $HtmlFile -Raw -Encoding UTF8
if ([string]::IsNullOrWhiteSpace($raw)) {
    if (-not $Quiet) { Write-Error "Empty file: $HtmlFile" }
    exit 2
}

$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

# ---------------------------------------------------------------------------------------
# Build a STRUCTURAL view of the document for the collapsibility checks: comments, <script>
# bodies and <style> bodies removed, so a `<details>` inside a JS template literal or a CSS
# selector string can never fake compliance. The FULL text is kept for the presence greps.
# ---------------------------------------------------------------------------------------
$struct = $raw
$struct = [regex]::Replace($struct, '(?s)<!--.*?-->', ' ')
$struct = [regex]::Replace($struct, '(?is)<script\b[^>]*>.*?</script\s*>', ' ')
$struct = [regex]::Replace($struct, '(?is)<style\b[^>]*>.*?</style\s*>', ' ')

# ---- R0: must be a complete standalone document ---------------------------------------
if ($struct -notmatch '(?i)<body\b' -or $struct -notmatch '(?i)</body\s*>') {
    $failures.Add("R0 STANDALONE: no <body>...</body>. publish-review.ps1 needs a COMPLETE standalone HTML document (<!doctype html><html><head>..</head><body>..</body></html>), not a body fragment.")
}

# ---- R1/R2: a collapsible TL;DR, and it sits above the first section -------------------
# A <details> qualifies as the TL;DR block if its id/class names it, or its <summary> text
# reads like an opening summary. Being FIRST is not enough on its own -- a page whose first
# collapsible happens to be section 1 has no TL;DR at all.
$tldrIndex = -1
$tldrOpen  = $false
$detailsWithSummary = [regex]::Matches($struct, '(?is)<details\b([^>]*)>\s*<summary\b[^>]*>(.*?)</summary\s*>')
foreach ($m in $detailsWithSummary) {
    $attrs = $m.Groups[1].Value
    $label = Strip-Tags $m.Groups[2].Value
    $namedTldr = $attrs -match '(?i)(id|class)\s*=\s*"[^"]*(tldr|tl-dr|tl_dr|summary|masthead)'
    $readsTldr = $label -match '(?i)(tl;?\s*dr|the short version|bottom line|in one minute|summary)'
    if ($namedTldr -or $readsTldr) {
        $tldrIndex = $m.Index
        $tldrOpen  = ($attrs -match '(?i)\bopen\b')
        break
    }
}

if ($tldrIndex -lt 0) {
    $failures.Add("R2 TLDR_COLLAPSIBLE: the opening TL;DR/summary block is not itself collapsible. Wrap it in <details class=`"tldr`" id=`"tldr`" open><summary>TL;DR</summary>...</details>. This is the single most-missed rule -- pages give every SECTION a toggle and leave the summary permanently expanded, which is exactly the 'read 30 pages of TL;DR every time' problem.")
} else {
    if (-not $tldrOpen) {
        $warnings.Add("R2 TLDR_OPEN: the TL;DR collapsible has no 'open' attribute, so a first-time reader lands on a closed summary. Ship it open; the injected fold-state memory handles repeat visits.")
    }
    # Sections underneath it.
    $firstH2 = [regex]::Match($struct, '(?i)<h2\b')
    if ($firstH2.Success -and $firstH2.Index -lt $tldrIndex) {
        $failures.Add("R1 TLDR_TOP: a section heading (<h2>) appears BEFORE the TL;DR block. The TL;DR goes at the very top, sections underneath it.")
    }
}

# ---- R3: EVERY section collapsible -----------------------------------------------------
# Linear scan: walk <details>/</details> depth and flag any <h2> sitting at depth 0, i.e. a
# section heading with no toggle around it. This is the check that catches the 2026-08-05
# dvd-shelf failure (one collapsible element among ~13 static sections passed the old
# hand-read of the rule).
$events = New-Object System.Collections.Generic.List[object]
foreach ($m in [regex]::Matches($struct, '(?i)<details\b')) {
    $events.Add([pscustomobject]@{ i = $m.Index; k = 'open'; t = '' })
}
foreach ($m in [regex]::Matches($struct, '(?i)</details\s*>')) {
    $events.Add([pscustomobject]@{ i = $m.Index; k = 'close'; t = '' })
}
foreach ($m in [regex]::Matches($struct, '(?is)<h2\b[^>]*>(.*?)</h2\s*>')) {
    $events.Add([pscustomobject]@{ i = $m.Index; k = 'h2'; t = (Strip-Tags $m.Groups[1].Value) })
}

$depth = 0
$naked = New-Object System.Collections.Generic.List[string]
$h2Count = 0
foreach ($e in ($events | Sort-Object i)) {
    switch ($e.k) {
        'open'  { $depth++ }
        'close' { if ($depth -gt 0) { $depth-- } }
        'h2'    {
            $h2Count++
            if ($depth -le 0) {
                $label = if ($e.t) { $e.t } else { '(untitled)' }
                if ($label.Length -gt 60) { $label = $label.Substring(0, 60) + '...' }
                $naked.Add($label)
            }
        }
    }
}

if ($h2Count -eq 0) {
    $warnings.Add("R3 SECTIONS: no <h2> headings found. If this page has sections, mark them up as <h2> so the toggle rule is checkable; if it genuinely has none, ignore this.")
} elseif ($naked.Count -gt 0) {
    $shown = ($naked | Select-Object -First 6) -join ' | '
    $more  = if ($naked.Count -gt 6) { " (+$($naked.Count - 6) more)" } else { "" }
    $failures.Add("R3 SECTION_TOGGLES: $($naked.Count) of $h2Count section(s) have NO collapse toggle -- their <h2> is not inside a <details>. Offenders: $shown$more. Every section gets its own toggle: <details open><summary><h2>Title</h2></summary>...</details>.")
}

# ---- R4: back-to-top -------------------------------------------------------------------
# Normally auto-injected by inject-review-furniture.ps1, so a failure here means the
# injector did not run or was stripped.
$hasBackToTop = ($raw -match '(?i)back[-_ ]?to[-_ ]?top') -or ($raw -match '(?i)id\s*=\s*"rf-top"')
$hasFixed     = $raw -match '(?i)position\s*:\s*fixed'
if (-not $hasBackToTop) {
    $failures.Add("R4 BACK_TO_TOP: no back-to-top control found. Run scripts/inject-review-furniture.ps1 on this file (publish-review.ps1 does this automatically).")
} elseif (-not $hasFixed) {
    $failures.Add("R4 BACK_TO_TOP_FLOATING: a back-to-top control exists but nothing on the page is position:fixed, so it is not persistently reachable by thumb.")
}

# ---- R5: nav, with a real hamburger on mobile ------------------------------------------
$hasNav      = ($struct -match '(?i)<nav\b') -or ($struct -match '(?i)class\s*=\s*"[^"]*nav-bar')
$anchorLinks = ([regex]::Matches($struct, '(?i)href\s*=\s*"#[^"]+"')).Count
$hasToggle   = $raw -match '(?i)(id|class)\s*=\s*"[^"]*(nav-?toggle|navToggle|hamburger|menu-?toggle)'
$mqNarrow    = $false
foreach ($m in [regex]::Matches($raw, '(?i)@media[^{]*max-width\s*:\s*(\d+)\s*px')) {
    if ([int]$m.Groups[1].Value -le 900) { $mqNarrow = $true; break }
}

if (-not $hasNav -or $anchorLinks -lt 2) {
    $failures.Add("R5 NAV: no section navigation found (need a <nav> / .nav-bar with at least 2 in-page href=`"#...`" links). He must be able to jump to any section without hunting for it.")
}
if (-not $hasToggle) {
    $failures.Add("R5 HAMBURGER: no mobile nav toggle found (expected an element with id/class matching nav-toggle / hamburger / menu-toggle). A horizontal pill or wrapped flat link list is NOT a substitute below the breakpoint.")
} elseif (-not $mqNarrow) {
    $failures.Add("R5 HAMBURGER_BREAKPOINT: a nav toggle exists but there is no @media (max-width: <=900px) rule, so the hamburger never actually takes over on a phone.")
}

# ---- R6: version + deploy stamp --------------------------------------------------------
if ($raw -notmatch [regex]::Escape('DEPLOY_STAMP_START')) {
    $failures.Add("R6 VERSION_STAMP: no version/deploy stamp. Run scripts/inject-deploy-stamp.ps1 (publish-review.ps1 does this automatically).")
}

# ---- report ----------------------------------------------------------------------------
$result = [pscustomobject]@{
    File     = (Resolve-Path $HtmlFile).Path
    Pass     = ($failures.Count -eq 0)
    Failures = @($failures)
    Warnings = @($warnings)
}

if (-not $Quiet) {
    Write-Host ""
    if ($result.Pass) {
        Write-Host "LAYOUT STANDARD: PASS  $((Split-Path $HtmlFile -Parent | Split-Path -Leaf))" -ForegroundColor Green
    } else {
        Write-Host "LAYOUT STANDARD: FAIL  $((Split-Path $HtmlFile -Parent | Split-Path -Leaf))" -ForegroundColor Red
    }
    foreach ($f in $failures) { Write-Host "  [FAIL] $f" -ForegroundColor Red }
    foreach ($w in $warnings) { Write-Host "  [WARN] $w" -ForegroundColor Yellow }
    if (-not $result.Pass) {
        Write-Host ""
        Write-Host "  Start from scripts/templates/review-page-template.html -- it is compliant out of the box." -ForegroundColor Cyan
    }
}

Write-Output $result
if (-not $result.Pass) { exit 1 }
exit 0
