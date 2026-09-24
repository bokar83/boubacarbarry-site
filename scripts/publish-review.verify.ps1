# verify-publish-review.ps1 -- isolated manual verification harness for the
# publish-review.ps1 duplicate-slug fix. Runs entirely inside a throwaway temp
# directory: copies the real scripts (unmodified) into a fake repo root so
# $PSScriptRoot resolution inside publish-review.ps1 stays correct, builds a
# minimal review/index.html with the marker comments rebuild-review-index.ps1
# requires, and an empty manifest. NEVER touches the real boubacarbarry-site
# working tree and NEVER runs git (every call uses -DryRun).
#
# No Pester (or any PowerShell test framework) exists anywhere in this repo as of
# 2026-08-07 -- checked before writing this. This harness is a plain-PowerShell,
# assert-and-exit-code pattern, not a framework dependency, so `pwsh -File
# scripts\publish-review.verify.ps1` (exit 0 = pass, exit 1 = fail) is a fine CI/manual
# gate for future changes to publish-review.ps1 without adding a new dependency.
#
# Usage: pwsh -File scripts\publish-review.verify.ps1

$ErrorActionPreference = "Stop"

$RealRepo = Split-Path $PSScriptRoot -Parent
$Fake = Join-Path $env:TEMP ("publish-review-verify-" + [guid]::NewGuid().ToString("N").Substring(0,8))

$fail = $false
function Assert($cond, $msg) {
    if ($cond) { Write-Host "  PASS: $msg" -ForegroundColor Green }
    else { Write-Host "  FAIL: $msg" -ForegroundColor Red; $script:fail = $true }
}

try {
    New-Item -ItemType Directory -Path (Join-Path $Fake "scripts") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $Fake "review") -Force | Out-Null

    # Full dependency list = every .ps1 publish-review.ps1 invokes via $PSScriptRoot
    # (kept in sync manually -- verified against `grep 'Join-Path $PSScriptRoot .*\.ps1'
    # scripts/publish-review.ps1` on 2026-09-24; missing 2 of these before that date,
    # which silently broke this harness -- see the encoding-followup commit).
    foreach ($f in @("publish-review.ps1", "inject-deploy-stamp.ps1", "inject-review-furniture.ps1", "validate-review-page.ps1", "rebuild-review-index.ps1")) {
        Copy-Item (Join-Path $RealRepo "scripts\$f") (Join-Path $Fake "scripts\$f") -Force
    }

    # Minimal index.html shell with the exact markers rebuild-review-index.ps1 requires.
    $indexShell = @"
<!doctype html><html><body>
    <!-- REVIEW_CARDS_START -->
    <!-- REVIEW_CARDS_END -->
    <!-- REVIEW_ARCHIVED_START -->
    <!-- REVIEW_ARCHIVED_END -->
</body></html>
"@
    Set-Content (Join-Path $Fake "review\index.html") $indexShell -Encoding UTF8
    Set-Content (Join-Path $Fake "review\.review-manifest.json") "[]" -Encoding UTF8

    $publishScript = Join-Path $Fake "scripts\publish-review.ps1"

    # --- Test 1: first publish creates the page ------------------------------
    $src1 = Join-Path $Fake "src1.html"
    Set-Content $src1 "<html><body><h1>Version One</h1></body></html>" -Encoding UTF8
    & $publishScript -SourceFile $src1 -Slug "test-page" -Title "Test Page" -DryRun -AllowNonCompliant | Out-Null

    $slugDirs = Get-ChildItem (Join-Path $Fake "review") -Directory | Where-Object { $_.Name -ne "archive" }
    Assert ($slugDirs.Count -eq 1) "after 1st publish: exactly 1 slug dir exists (found $($slugDirs.Count): $($slugDirs.Name -join ', '))"
    Assert (Test-Path (Join-Path $Fake "review\test-page\index.html")) "review/test-page/index.html exists"

    $manifest1 = Get-Content (Join-Path $Fake "review\.review-manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert (@($manifest1).Count -eq 1) "manifest has exactly 1 row after 1st publish (found $(@($manifest1).Count))"

    # --- Test 2: republish of the SAME slug updates in place, no -2 fork -----
    $src2 = Join-Path $Fake "src2.html"
    Set-Content $src2 "<html><body><h1>Version Two -- UPDATED CONTENT</h1></body></html>" -Encoding UTF8
    Start-Sleep -Milliseconds 50   # ensure a distinct mtime/timestamp in the stamp
    & $publishScript -SourceFile $src2 -Slug "test-page" -DryRun -AllowNonCompliant | Out-Null

    $slugDirsAfter = Get-ChildItem (Join-Path $Fake "review") -Directory | Where-Object { $_.Name -ne "archive" }
    Assert ($slugDirsAfter.Count -eq 1) "after republish: STILL exactly 1 slug dir (no -2 fork). Found: $($slugDirsAfter.Name -join ', ')"
    Assert (-not (Test-Path (Join-Path $Fake "review\test-page-2"))) "review/test-page-2 was NOT created"

    $body = Get-Content (Join-Path $Fake "review\test-page\index.html") -Raw
    Assert ($body -match "Version Two -- UPDATED CONTENT") "review/test-page/index.html now shows the NEW content"
    Assert ($body -notmatch "Version One") "review/test-page/index.html no longer shows the OLD content"

    $manifest2 = @(Get-Content (Join-Path $Fake "review\.review-manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json)
    Assert ($manifest2.Count -eq 1) "manifest STILL has exactly 1 row after republish (no duplicate row). Found $($manifest2.Count)"
    $row = $manifest2 | Where-Object { $_.slug -eq "test-page" }
    Assert ($row -ne $null) "manifest row for slug 'test-page' still present"
    Assert ($row.title -eq "Test Page") "manifest title preserved from 1st publish (no -Title passed on republish): got '$($row.title)'"

    # --- Test 3: -DifferentPage explicitly forks a distinct page -------------
    $src3 = Join-Path $Fake "src3.html"
    Set-Content $src3 "<html><body><h1>Unrelated Page</h1></body></html>" -Encoding UTF8
    & $publishScript -SourceFile $src3 -Slug "test-page" -Title "Unrelated" -DifferentPage -DryRun -AllowNonCompliant 2>$null | Out-Null

    Assert (Test-Path (Join-Path $Fake "review\test-page-2\index.html")) "review/test-page-2/index.html created under -DifferentPage"
    Assert (Test-Path (Join-Path $Fake "review\test-page\index.html")) "original review/test-page/index.html untouched by the -DifferentPage publish"
    $manifest3 = @(Get-Content (Join-Path $Fake "review\.review-manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json)
    Assert ($manifest3.Count -eq 2) "manifest now has 2 rows (original + the deliberate -DifferentPage fork). Found $($manifest3.Count)"

    # --- Test 4: closed/archived page is revived by a republish --------------
    $m = @(Get-Content (Join-Path $Fake "review\.review-manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json)
    ($m | Where-Object { $_.slug -eq "test-page" }).closed = "2026-01-01"
    ($m | Where-Object { $_.slug -eq "test-page" }).archived = $false
    $m | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $Fake "review\.review-manifest.json") -Encoding UTF8

    $src4 = Join-Path $Fake "src4.html"
    Set-Content $src4 "<html><body><h1>Version Three -- revived</h1></body></html>" -Encoding UTF8
    & $publishScript -SourceFile $src4 -Slug "test-page" -DryRun -AllowNonCompliant | Out-Null

    $m4 = @(Get-Content (Join-Path $Fake "review\.review-manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json)
    $row4 = $m4 | Where-Object { $_.slug -eq "test-page" }
    Assert ($row4.closed -eq $null) "republishing a closed page resets 'closed' to null (revives it)"

    # --- Test 5: non-ASCII title survives 3 republishes with NO byte growth --
    # Regression test for the 2026-09-23 mojibake-compounding bug (SYS infra-drift):
    # missing -Encoding UTF8 on a Get-Content|ConvertFrom-Json read-back mis-decodes
    # UTF-8 as cp1252 on Windows PowerShell 5.1, and the next write re-encodes the
    # mojibake as "real" UTF-8 -- one extra generation of garbage bytes PER RUN. A
    # title with an em-dash ("--" below) went from 22 chars to 35.8 MILLION chars
    # across ~2 weeks of publishes. This test compresses that into 3 republishes in
    # one process and asserts the manifest file size is IDENTICAL after each one --
    # any growth at all means the encoding bug is back.
    $emdashTitle = "The Encoding Test [U+2014] Round Trip"  # literal U+2014 EM DASH below
    $emdashTitle = $emdashTitle -replace '\[U\+2014\]', [char]0x2014
    $src5 = Join-Path $Fake "src5.html"
    Set-Content $src5 "<html><body><h1>Encoding test v1</h1></body></html>" -Encoding UTF8
    & $publishScript -SourceFile $src5 -Slug "encoding-test" -Title $emdashTitle -DryRun -AllowNonCompliant | Out-Null
    $manifestPath5 = Join-Path $Fake "review\.review-manifest.json"
    $size5a = (Get-Item $manifestPath5).Length

    Set-Content $src5 "<html><body><h1>Encoding test v2</h1></body></html>" -Encoding UTF8
    & $publishScript -SourceFile $src5 -Slug "encoding-test" -DryRun -AllowNonCompliant | Out-Null
    $size5b = (Get-Item $manifestPath5).Length

    Set-Content $src5 "<html><body><h1>Encoding test v3</h1></body></html>" -Encoding UTF8
    & $publishScript -SourceFile $src5 -Slug "encoding-test" -DryRun -AllowNonCompliant | Out-Null
    $size5c = (Get-Item $manifestPath5).Length

    Assert ($size5b -eq $size5a) "manifest size unchanged after republish #2 (no encoding-bug growth): $size5a -> $size5b bytes"
    Assert ($size5c -eq $size5b) "manifest size unchanged after republish #3 (no encoding-bug growth): $size5b -> $size5c bytes"

    $m5 = @(Get-Content $manifestPath5 -Raw -Encoding UTF8 | ConvertFrom-Json)
    $row5 = $m5 | Where-Object { $_.slug -eq "encoding-test" }
    Assert ($row5.title -eq $emdashTitle) "em-dash title round-trips byte-identical after 3 publishes: got '$($row5.title)' (len $($row5.title.Length)), want len $($emdashTitle.Length)"
    Assert ($row5.title.Length -lt 100) "em-dash title stayed short (len $($row5.title.Length)), did not balloon"

    Write-Host ""
    if ($fail) { Write-Host "VERIFICATION FAILED -- see FAIL lines above." -ForegroundColor Red; exit 1 }
    else { Write-Host "ALL CHECKS PASSED." -ForegroundColor Green; exit 0 }
} finally {
    if (Test-Path $Fake) { Remove-Item $Fake -Recurse -Force -ErrorAction SilentlyContinue }
}
