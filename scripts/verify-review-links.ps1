# verify-review-links.ps1 -- broken-link sweep for the gated /review/ hub.
#
# Walks EVERY entry in review/.review-manifest.json (active AND archived) and confirms
# its public URL actually resolves: active pages should 200 directly; archived pages
# should either 200 directly (still reachable) or resolve via gate.php's archive-fallback
# 301 (shipped 2026-08-07, commit 8847beb) to a 200. Invoke-WebRequest follows redirects
# by default, so a working archive-fallback and a working direct hit look identical here
# (both end at 200) -- this script checks REACHABILITY, not which path got you there.
#
# Auth: the /review/ section is a password gate (review/gate.php), not a per-page secret.
# This repo is PUBLIC on GitHub, so the password is deliberately NEVER hardcoded here --
# pass it via -Password or the REVIEW_GATE_PASSWORD env var. Where to find the current
# password if you don't have it: it is not in this repo (by design, see gate.php's own
# header comment) -- ask Boubacar, or check agentsHQ's memory/ (a separate, private repo)
# for the reference doc that records it.
#
# Usage:
#   $env:REVIEW_GATE_PASSWORD = '<the password>'
#   pwsh -File scripts\verify-review-links.ps1
#   pwsh -File scripts\verify-review-links.ps1 -Password '<the password>' -BaseUrl 'https://boubacarbarry.com'
#   pwsh -File scripts\verify-review-links.ps1 -Slug 20260721-bridge-vehicle   # single entry
#
# Exit code: 0 = every entry resolved clean. 1 = at least one entry failed (see report).
# Does NOT run on a schedule -- this is an on-demand script. A future session can wire it
# to cron/Task Scheduler once there's a place for the report to land (Telegram, a log
# file, etc.) -- not built here, scope discipline for this pass.

param(
    [string]$BaseUrl = "https://boubacarbarry.com",
    [string]$Password = $env:REVIEW_GATE_PASSWORD,
    [string]$Slug = "",
    [int]$TimeoutSec = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
$ManifestPath = Join-Path $RepoRoot "review\.review-manifest.json"

if (-not $Password) {
    Write-Error "No gate password supplied. Set `$env:REVIEW_GATE_PASSWORD or pass -Password. Never hardcode it in a committed file -- this repo is public."
    exit 2
}

if (-not (Test-Path $ManifestPath)) {
    Write-Error "Manifest not found: $ManifestPath"
    exit 2
}

$manifest = @(Get-Content $ManifestPath -Raw | ConvertFrom-Json)
if ($Slug) { $manifest = @($manifest | Where-Object { $_.slug -eq $Slug }) }
if ($manifest.Count -eq 0) {
    Write-Error "No manifest entries to check (Slug filter '$Slug' matched nothing?)."
    exit 2
}

# -UseBasicParsing avoids the IE-engine dependency on Windows PowerShell 5.1 and is a
# harmless no-op (with a deprecation warning) on pwsh 7+, matching the PS5.1/pwsh7
# dual-compatibility already called out in rebuild-review-index.ps1.
$useBasicParsing = $true

# --- Log in once, keep the session cookie for every subsequent request ------
$gateUrl = "$BaseUrl/review/"
Write-Host "Logging into $gateUrl ..."
$session = $null
try {
    $loginArgs = @{
        Uri             = $gateUrl
        Method          = "POST"
        Body            = @{ gate_password = $Password }
        SessionVariable = "session"
        TimeoutSec      = $TimeoutSec
        MaximumRedirection = 5
    }
    if ($useBasicParsing) { $loginArgs.UseBasicParsing = $true }
    Invoke-WebRequest @loginArgs | Out-Null
} catch {
    Write-Error "Login POST failed: $($_.Exception.Message)"
    exit 2
}
if (-not $session -or -not $session.Cookies.GetCookies($gateUrl) -or $session.Cookies.GetCookies($gateUrl).Count -eq 0) {
    Write-Error "Login did not produce a session cookie -- wrong password, or gate.php form field/cookie name changed since this script was written (expects 'gate_password' POST field, 'bb_review' cookie). Aborting rather than reporting false failures for every URL."
    exit 2
}
Write-Host "Session cookie acquired. Checking $($manifest.Count) manifest entr$(if ($manifest.Count -eq 1) {'y'} else {'ies'})..."
Write-Host ""

# --- Sweep every manifest entry ----------------------------------------------
$results = New-Object System.Collections.Generic.List[object]
foreach ($item in $manifest) {
    $url = "$BaseUrl/review/$($item.slug)/"
    $status = $null
    $ok = $false
    $note = ""
    try {
        $reqArgs = @{
            Uri        = $url
            Method     = "GET"
            WebSession = $session
            TimeoutSec = $TimeoutSec
            MaximumRedirection = 5
        }
        if ($useBasicParsing) { $reqArgs.UseBasicParsing = $true }
        $resp = Invoke-WebRequest @reqArgs
        $status = [int]$resp.StatusCode
        $ok = ($status -eq 200)
        $finalUri = $null
        try { $finalUri = $resp.BaseResponse.ResponseUri.AbsoluteUri } catch { $finalUri = $null }
        if ($finalUri -and $finalUri -ne $url) { $note = "resolved via redirect -> $finalUri" }
    } catch {
        # Invoke-WebRequest throws on non-2xx. Pull the real status code back out so a
        # 404/410/etc. is reported as data, not swallowed as a script crash.
        if ($_.Exception.Response) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = -1 }
        } else {
            $status = -1
        }
        $ok = $false
        $note = $_.Exception.Message
    }
    $results.Add([PSCustomObject]@{
        Slug     = $item.slug
        Archived = [bool]$item.archived
        Status   = $status
        Result   = if ($ok) { "PASS" } else { "FAIL" }
        Url      = $url
        Note     = $note
    })
}

# --- Report -------------------------------------------------------------------
$fails = @($results | Where-Object { $_.Result -eq "FAIL" })
$passes = @($results | Where-Object { $_.Result -eq "PASS" })

Write-Host "=== Broken-link sweep report ($($results.Count) entries) ==="
Write-Host "PASS: $($passes.Count)   FAIL: $($fails.Count)"
Write-Host ""
if ($fails.Count -gt 0) {
    Write-Host "--- FAILURES ---" -ForegroundColor Red
    $fails | Sort-Object Archived, Slug | Format-Table Slug, Archived, Status, Url, Note -AutoSize | Out-String | Write-Host
} else {
    Write-Host "No broken links. Every manifest entry (active + archived) resolved to 200." -ForegroundColor Green
}

if ($fails.Count -gt 0) { exit 1 } else { exit 0 }
