# rebuild-review-index.verify.ps1 -- isolated manual verification harness for the
# pinned_order feature (2026-08-07) in rebuild-review-index.ps1. Same pattern as
# scripts\publish-review.verify.ps1: runs entirely inside a throwaway temp directory,
# copies the real script unmodified, builds a minimal manifest + index.html shell with
# the marker comments the script requires. NEVER touches the real boubacarbarry-site
# working tree, NEVER hits the network (Supabase fetch failure is caught + warned by
# the script itself, so this runs offline fine).
#
# No Pester exists in this repo (checked before writing this, same finding as
# publish-review.verify.ps1's own header) -- plain-PowerShell assert-and-exit-code.
#
# Usage: pwsh -File scripts\rebuild-review-index.verify.ps1

$ErrorActionPreference = "Stop"

$RealRepo = Split-Path $PSScriptRoot -Parent
$Fake = Join-Path $env:TEMP ("rebuild-review-index-verify-" + [guid]::NewGuid().ToString("N").Substring(0,8))

$fail = $false
function Assert($cond, $msg) {
    if ($cond) { Write-Host "  PASS: $msg" -ForegroundColor Green }
    else { Write-Host "  FAIL: $msg" -ForegroundColor Red; $script:fail = $true }
}

try {
    New-Item -ItemType Directory -Path (Join-Path $Fake "scripts") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $Fake "review") -Force | Out-Null
    Copy-Item (Join-Path $RealRepo "scripts\rebuild-review-index.ps1") (Join-Path $Fake "scripts\rebuild-review-index.ps1") -Force

    $indexShell = @"
<!doctype html><html><body>
    <!-- REVIEW_CARDS_START -->
    <!-- REVIEW_CARDS_END -->
    <!-- REVIEW_ARCHIVED_START -->
    <!-- REVIEW_ARCHIVED_END -->
</body></html>
"@
    Set-Content (Join-Path $Fake "review\index.html") $indexShell -Encoding UTF8

    # Fixture: 5 items, all dated WELL within the 21-day auto-archive window (relative to
    # today, never a fixed past date) so this run can NEVER trip the auto-archive sweep --
    # that sweep POSTs a write-back to the REAL production Supabase review_states table
    # (see rebuild-review-index.ps1's "review_states: wrote back archived=true" step),
    # and this harness must stay side-effect-free against production data. A fixed date
    # (e.g. hardcoded 2026-01-01) would silently start triggering that write-back again
    # the day this repo's "now" passes 21 days past it -- relative dates make that
    # impossible by construction, not just "unlikely today".
    $d0 = Get-Date
    function AgoDate([int]$days) { return $d0.AddDays(-$days).ToString('yyyy-MM-dd') }
    #   a-unkept           created 5d ago,  not kept                -> should sort LAST
    #   b-kept-nopin       created 4d ago,  kept, no pinned_order   -> kept block, date-desc among unpinned kept
    #   c-kept-pin2        created 3d ago,  kept, pinned_order=2    -> kept block, position 2 of the pinned ones
    #   d-kept-pin1        created 2d ago,  kept, pinned_order=1    -> kept block, position 1 (first card overall)
    #   e-kept-nopin-newer created 1d ago,  kept, no pinned_order   -> kept block, newer than b so ABOVE b among unpinned kept
    $manifest = @(
        @{ slug = "a-unkept";            title = "A Unkept";             created = (AgoDate 5); closed = $null; archived = $false },
        @{ slug = "b-kept-nopin";        title = "B Kept No Pin";        created = (AgoDate 4); closed = $null; archived = $false; keep = $true },
        @{ slug = "c-kept-pin2";         title = "C Kept Pin 2";         created = (AgoDate 3); closed = $null; archived = $false; keep = $true; pinned_order = 2 },
        @{ slug = "d-kept-pin1";         title = "D Kept Pin 1";         created = (AgoDate 2); closed = $null; archived = $false; keep = $true; pinned_order = 1 },
        @{ slug = "e-kept-nopin-newer";  title = "E Kept No Pin Newer";  created = (AgoDate 1); closed = $null; archived = $false; keep = $true }
    )
    $manifest | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $Fake "review\.review-manifest.json") -Encoding UTF8

    # The real script prunes any manifest entry whose review/<slug>/ folder does not
    # exist on disk (dead-entry cleanup, see ghostRemoved in rebuild-review-index.ps1).
    # Give every fixture slug a real (trivial) page folder so it survives that pass.
    foreach ($e in $manifest) {
        $dir = Join-Path $Fake "review\$($e.slug)"
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Set-Content (Join-Path $dir "index.html") "<html><head><title>$($e.title)</title></head><body></body></html>" -Encoding UTF8
    }

    Push-Location $Fake
    try {
        & (Join-Path $Fake "scripts\rebuild-review-index.ps1") 2>&1 | Out-String | Write-Host
    } finally {
        Pop-Location
    }

    $html = Get-Content (Join-Path $Fake "review\index.html") -Raw
    $slugOrder = [regex]::Matches($html, 'data-slug="([a-z0-9-]+)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique

    Write-Host ""
    Write-Host "Rendered card order: $($slugOrder -join ' -> ')"
    Write-Host ""

    $expected = @('d-kept-pin1', 'c-kept-pin2', 'e-kept-nopin-newer', 'b-kept-nopin', 'a-unkept')
    Assert (($slugOrder -join ',') -eq ($expected -join ',')) "card order is exactly: $($expected -join ' -> ')"

    Assert ($slugOrder.IndexOf('d-kept-pin1') -eq 0) "d-kept-pin1 (pinned_order=1) renders FIRST"
    Assert ($slugOrder.IndexOf('c-kept-pin2') -eq 1) "c-kept-pin2 (pinned_order=2) renders SECOND"
    Assert ($slugOrder.IndexOf('e-kept-nopin-newer') -lt $slugOrder.IndexOf('b-kept-nopin')) "unpinned kept items still fall back to date-desc (e newer than b)"
    Assert ($slugOrder.IndexOf('a-unkept') -eq ($slugOrder.Count - 1)) "non-kept item still renders LAST, below the whole kept block"

    Write-Host ""
    if ($fail) { Write-Host "VERIFICATION FAILED -- see FAIL lines above." -ForegroundColor Red; exit 1 }
    else { Write-Host "ALL CHECKS PASSED." -ForegroundColor Green; exit 0 }
} finally {
    if (Test-Path $Fake) { Remove-Item $Fake -Recurse -Force -ErrorAction SilentlyContinue }
}
