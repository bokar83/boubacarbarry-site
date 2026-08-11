# audit-review-pages.ps1 -- score every already-published /review/ page against the layout
# hard standard, without touching a single one of them.
#
# READ-ONLY. This script never edits, republishes, or fixes anything. Retrofitting the
# existing pages is Boubacar's decision, not an agent's -- this only tells him how big the
# problem is and which pages are the worst.
#
# Usage:
#   .\scripts\audit-review-pages.ps1              # summary + worst offenders
#   .\scripts\audit-review-pages.ps1 -Full        # every page, every failure
#   .\scripts\audit-review-pages.ps1 -Csv out.csv # machine-readable

param(
    [switch]$Full,
    [string]$Csv = "",
    [switch]$IncludeArchive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot  = Split-Path $PSScriptRoot -Parent
$ReviewDir = Join-Path $RepoRoot "review"
$Validator = Join-Path $PSScriptRoot "validate-review-page.ps1"

$pages = Get-ChildItem -Path $ReviewDir -Directory |
    Where-Object { $IncludeArchive -or $_.Name -ne 'archive' } |
    ForEach-Object { Join-Path $_.FullName "index.html" } |
    Where-Object { Test-Path $_ }

if ($IncludeArchive) {
    $archiveDir = Join-Path $ReviewDir "archive"
    if (Test-Path $archiveDir) {
        $pages += Get-ChildItem -Path $archiveDir -Directory |
            ForEach-Object { Join-Path $_.FullName "index.html" } |
            Where-Object { Test-Path $_ }
    }
}

$rows = @()
foreach ($p in $pages) {
    $slug = Split-Path (Split-Path $p -Parent) -Leaf
    $r = $null
    try {
        $r = @(& $Validator $p -Quiet)[-1]
    } catch {
        $rows += [pscustomobject]@{ Slug = $slug; Pass = $false; FailCount = 99; Failures = "VALIDATOR ERROR: $($_.Exception.Message)"; Rules = "" }
        continue
    }
    $ruleIds = @($r.Failures | ForEach-Object { ($_ -split ' ')[0] + ' ' + (($_ -split ' ')[1] -replace ':','') }) -join ','
    $rows += [pscustomobject]@{
        Slug      = $slug
        Pass      = $r.Pass
        FailCount = @($r.Failures).Count
        Failures  = (@($r.Failures) -join ' || ')
        Rules     = $ruleIds
    }
}

$total  = $rows.Count
$passed = @($rows | Where-Object { $_.Pass }).Count
$failed = $total - $passed

Write-Host ""
Write-Host "===== /review/ LAYOUT STANDARD AUDIT =====" -ForegroundColor Cyan
Write-Host ("  pages checked : {0}" -f $total)
Write-Host ("  COMPLIANT     : {0}" -f $passed) -ForegroundColor Green
Write-Host ("  NON-COMPLIANT : {0}  ({1:P0})" -f $failed, ($(if ($total) { $failed / $total } else { 0 }))) -ForegroundColor Red
Write-Host ""

# Which rule is broken most often -- tells you what the tooling should fix first.
$ruleTally = @{}
foreach ($row in $rows) {
    foreach ($f in ($row.Failures -split ' \|\| ')) {
        if (-not $f) { continue }
        $id = (($f -split ':')[0]).Trim()
        if (-not $id) { continue }
        if (-not $ruleTally.ContainsKey($id)) { $ruleTally[$id] = 0 }
        $ruleTally[$id]++
    }
}
Write-Host "Failures by rule:" -ForegroundColor Cyan
$ruleTally.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
    Write-Host ("  {0,-28} {1,3} pages" -f $_.Key, $_.Value)
}

Write-Host ""
Write-Host "Worst offenders (most rules broken):" -ForegroundColor Cyan
$rows | Where-Object { -not $_.Pass } | Sort-Object -Property @{Expression='FailCount';Descending=$true}, @{Expression='Slug';Descending=$false} |
    Select-Object -First $(if ($Full) { $total } else { 15 }) |
    ForEach-Object {
        Write-Host ("  {0,2} fails  {1}" -f $_.FailCount, $_.Slug) -ForegroundColor Yellow
        Write-Host ("            {0}" -f $_.Rules) -ForegroundColor DarkGray
    }

if ($passed -gt 0) {
    Write-Host ""
    Write-Host "Compliant pages:" -ForegroundColor Green
    $rows | Where-Object { $_.Pass } | ForEach-Object { Write-Host ("  PASS  {0}" -f $_.Slug) -ForegroundColor Green }
}

if ($Csv) {
    $rows | Export-Csv -Path $Csv -NoTypeInformation -Encoding UTF8
    Write-Host ""
    Write-Host "CSV written: $Csv"
}

Write-Host ""
Write-Host "This audit changed nothing. Retrofitting existing pages is a separate decision." -ForegroundColor DarkGray
