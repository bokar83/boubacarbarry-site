# publish-review.ps1 -- push an HTML file to boubacarbarry.com/review/<slug>/
# Usage: .\scripts\publish-review.ps1 <path-to-html-file> <slug> [<title>]
# Example: .\scripts\publish-review.ps1 "D:\tmp\offer-v2.html" "offer-v2" "CW Offer V2"
#
# Does: copy -> commit -> push -> regenerate index -> prints live URL

param(
    [Parameter(Mandatory)][string]$SourceFile,
    [Parameter(Mandatory)][string]$Slug,
    [string]$Title = "",
    [string]$Version = "v1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
$ReviewDir = Join-Path $RepoRoot "review"
$ManifestPath = Join-Path $ReviewDir ".review-manifest.json"
$SlugDir = Join-Path $ReviewDir $Slug
$Today = (Get-Date -Format "yyyy-MM-dd")
$LiveUrl = "https://boubacarbarry.com/review/$Slug/"

# Validate source
if (-not (Test-Path $SourceFile)) {
    Write-Error "Source file not found: $SourceFile"
    exit 1
}

# Default title from slug
if (-not $Title) { $Title = $Slug -replace '-', ' ' | ForEach-Object { (Get-Culture).TextInfo.ToTitleCase($_) } }

# Check for slug collision (append -2 if same slug same day)
if (Test-Path (Join-Path $SlugDir "index.html")) {
    Write-Warning "Slug '$Slug' already exists. Appending -2. Use a different slug to avoid."
    $Slug = "$Slug-2"
    $SlugDir = Join-Path $ReviewDir $Slug
    $LiveUrl = "https://boubacarbarry.com/review/$Slug/"
}

New-Item -ItemType Directory -Path $SlugDir -Force | Out-Null
Copy-Item $SourceFile (Join-Path $SlugDir "index.html") -Force

# HARD RULE (feedback_review_pages_version_deploy_stamp): auto-inject the version +
# deploy-timestamp stamp (upper-right) so every review page is stamped at publish time.
# No one can forget it -- it is part of the flow, not a manual step.
& (Join-Path $PSScriptRoot "inject-deploy-stamp.ps1") (Join-Path $SlugDir "index.html") $Version

# Update manifest
$manifest = if (Test-Path $ManifestPath) {
    Get-Content $ManifestPath -Raw | ConvertFrom-Json
} else { @() }

$manifest = @($manifest) + @([PSCustomObject]@{
    slug     = $Slug
    title    = $Title
    created  = $Today
    closed   = $null
    archived = $false
})
$manifest | ConvertTo-Json -Depth 3 | Set-Content $ManifestPath -Encoding UTF8

# Regenerate index
& (Join-Path $PSScriptRoot "rebuild-review-index.ps1")

# Commit + push
Set-Location $RepoRoot
git add "review/$Slug/" "review/index.html" "review/.review-manifest.json"
git commit -m "review: publish $Slug ($Today)"
git push origin main

# HARD RULE: NEVER print "LIVE" without proving it. The GitHub->Hostinger webhook is
# known-unreliable (it returns 200 and deploys nothing -- observed 2026-06-16 and again
# 2026-07-16, when this script told two lanes their pages were live while both 404'd for
# 4 hours). A push is NOT a deploy. Verify the real URL or fail loudly.
Write-Host ""
Write-Host "Pushed. Verifying $LiveUrl is actually live (webhook is unreliable)..." -ForegroundColor Cyan

# 200 alone is NOT proof -- a stale tree can serve an old page at the same URL. Anchor the
# check to content we KNOW is in the file we just published: its <title>. Do NOT use the
# slug as the marker; real published pages do not contain their own slug (verified
# 2026-07-16 against a live page), which would false-negative every time.
$publishedHtml = Get-Content (Join-Path $SlugDir "index.html") -Raw
$marker = if ($publishedHtml -match '<title>\s*(.*?)\s*</title>') { $matches[1] } else { $null }
if (-not $marker) {
    Write-Warning "Published file has no <title>; falling back to HTTP 200 check only (weaker proof)."
}

$deadline = (Get-Date).AddMinutes(5)
$live = $false
$lastStatus = "no response"

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 15
    $cb = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    try {
        $resp = Invoke-WebRequest -Uri "$LiveUrl`?cb=$cb" -UseBasicParsing -TimeoutSec 20
        $lastStatus = "HTTP $($resp.StatusCode)"
        if ($resp.StatusCode -eq 200) {
            if (-not $marker) { $live = $true; break }
            if ($resp.Content -match [regex]::Escape($marker)) { $live = $true; break }
            $lastStatus = "HTTP 200 but served page is not ours (stale deploy -- expected title '$marker')"
        }
    } catch {
        $lastStatus = "HTTP $($_.Exception.Response.StatusCode.value__)"
    }
    Write-Host "  ...not live yet ($lastStatus)" -ForegroundColor DarkGray
}

# Verify the /review/ index actually lists the new card -- a page can be live while the
# hub that links to it is stale, which is how a publish silently goes unnoticed.
$indexOk = $false
if ($live) {
    try {
        $cb = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
        $idx = Invoke-WebRequest -Uri "https://boubacarbarry.com/review/?cb=$cb" -UseBasicParsing -TimeoutSec 20
        $indexOk = $idx.Content -match [regex]::Escape($Slug)
    } catch { $indexOk = $false }
}

if ($live -and $indexOk) {
    Write-Host ""
    Write-Host "VERIFIED LIVE (HTTP 200 + content + index card): $LiveUrl" -ForegroundColor Green
    Write-Host "Post this URL in chat for Boubacar to review on his phone."
    exit 0
}

Write-Host ""
if ($live -and -not $indexOk) {
    Write-Host "PARTIAL: page is live but /review/ index does NOT list '$Slug'." -ForegroundColor Red
    Write-Host "The review hub is stale. Boubacar will not find this page from the index."
} else {
    Write-Host "NOT LIVE after 5 minutes. Last status: $lastStatus" -ForegroundColor Red
    Write-Host "The commit IS pushed to origin/main -- this is a DEPLOY failure, not a content bug."
}
Write-Host ""
Write-Host "The GitHub->Hostinger webhook did not apply the push. Run the documented force-deploy:" -ForegroundColor Yellow
Write-Host "  see scripts/deploy-static-hostinger.mjs (header has the full runbook)"
Write-Host "  archive origin/main, then deploy the COMPLETE tree (a partial archive WIPES the site)."
Write-Host ""
Write-Error "publish-review: '$Slug' is NOT confirmed live. Do NOT tell Boubacar it is published."
exit 1
