# prune-reviews.ps1 -- archive closed reviews (>7d) and auto-close stale ones (>14d)
# Archive-not-delete: moves files to review/archive/<slug>/. Manifest updated.
# Cron: add to agentsHQ prune_merged_worktrees cron family (daily 09:00 or weekly).
# Manual: .\scripts\prune-reviews.ps1 [-DryRun]

param([switch]$DryRun)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
$ManifestPath = Join-Path $RepoRoot "review/.review-manifest.json"
$ArchiveDir = Join-Path $RepoRoot "review/archive"
$LogPath = Join-Path $RepoRoot "review/prune.log"
$Today = Get-Date
$TodayStr = $Today.ToString("yyyy-MM-dd")

if (-not (Test-Path $ManifestPath)) { Write-Host "No manifest. Nothing to prune."; exit 0 }

$manifest = @(Get-Content $ManifestPath -Raw | ConvertFrom-Json)
$archived = @()

foreach ($item in $manifest) {
    if ($item.archived) { continue }

    $created = [datetime]::ParseExact($item.created, "yyyy-MM-dd", $null)
    $ageCreated = ($Today - $created).Days

    # Auto-close if stale (>14d, no activity)
    if (-not $item.closed -and $ageCreated -gt 14) {
        Write-Host "AUTO-CLOSE: $($item.slug) (created $($item.created), $ageCreated days old)"
        if (-not $DryRun) { $item.closed = $TodayStr }
    }

    if (-not $item.closed) { continue }

    $closed = [datetime]::ParseExact($item.closed, "yyyy-MM-dd", $null)
    $ageClosed = ($Today - $closed).Days

    if ($ageClosed -lt 7) {
        Write-Host "HOLD: $($item.slug) closed $($item.closed) ($ageClosed d ago, need 7d)"
        continue
    }

    # Archive
    $srcDir = Join-Path $RepoRoot "review/$($item.slug)"
    $dstDir = Join-Path $ArchiveDir $item.slug

    Write-Host "ARCHIVE: $($item.slug) (closed $($item.closed), $ageClosed d ago)"
    if (-not $DryRun) {
        if (Test-Path $srcDir) {
            New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
            Copy-Item "$srcDir/*" $dstDir -Recurse -Force
            Remove-Item $srcDir -Recurse -Force
        }
        $item.archived = $true
        $archived += $item.slug
    }
}

if (-not $DryRun) {
    $manifest | ConvertTo-Json -Depth 3 | Set-Content $ManifestPath -Encoding UTF8

    # Rebuild index (archived entries drop off)
    & (Join-Path $PSScriptRoot "rebuild-review-index.ps1")

    # Log
    $logEntry = "$TodayStr archived=[$($archived -join ', ')] total_archived=$(($manifest | Where-Object { $_.archived }).Count) active=$(($manifest | Where-Object { -not $_.archived -and -not $_.closed }).Count)"
    Add-Content $LogPath $logEntry

    if ($archived.Count -gt 0) {
        Set-Location $RepoRoot
        git add "review/"
        git commit -m "chore(review-prune): archive $($archived -join ', ') ($TodayStr)"
        git push origin main
        Write-Host "Committed + pushed. Archived: $($archived -join ', ')"
    } else {
        Write-Host "Nothing to archive today."
    }
} else {
    Write-Host "(dry-run -- no changes made)"
}
