# close-review.ps1 -- stamp close date on a review page (starts 7-day archive countdown)
# Usage: .\scripts\close-review.ps1 <slug>
# Example: .\scripts\close-review.ps1 "offer-v2"

param([Parameter(Mandatory)][string]$Slug)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
$ManifestPath = Join-Path $RepoRoot "review/.review-manifest.json"
$Today = (Get-Date -Format "yyyy-MM-dd")

if (-not (Test-Path $ManifestPath)) { Write-Error "Manifest not found."; exit 1 }

$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$entry = $manifest | Where-Object { $_.slug -eq $Slug }
if (-not $entry) { Write-Error "Slug '$Slug' not found in manifest."; exit 1 }
if ($entry.closed) { Write-Warning "Already closed on $($entry.closed). Nothing to do."; exit 0 }

$entry.closed = $Today
$manifest | ConvertTo-Json -Depth 3 | Set-Content $ManifestPath -Encoding UTF8

# Regenerate index (closed items drop off active list)
& (Join-Path $PSScriptRoot "rebuild-review-index.ps1")

Set-Location $RepoRoot
git add "review/index.html" "review/.review-manifest.json"
git commit -m "review: close $Slug ($Today) -- archive in 7d"
git push origin main

Write-Host "Closed '$Slug'. Will be archived by prune-reviews after $Today + 7 days." -ForegroundColor Yellow
