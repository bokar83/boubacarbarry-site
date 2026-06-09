# publish-review.ps1 -- push an HTML file to boubacarbarry.com/review/<slug>/
# Usage: .\scripts\publish-review.ps1 <path-to-html-file> <slug> [<title>]
# Example: .\scripts\publish-review.ps1 "D:\tmp\offer-v2.html" "offer-v2" "CW Offer V2"
#
# Does: copy -> commit -> push -> regenerate index -> prints live URL

param(
    [Parameter(Mandatory)][string]$SourceFile,
    [Parameter(Mandatory)][string]$Slug,
    [string]$Title = ""
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

Write-Host ""
Write-Host "LIVE: $LiveUrl" -ForegroundColor Green
Write-Host "Post this URL in chat for Boubacar to review on his phone."
