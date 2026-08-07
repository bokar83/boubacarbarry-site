# publish-review.ps1 -- push an HTML file to boubacarbarry.com/review/<slug>/
# Usage: .\scripts\publish-review.ps1 <path-to-html-file> <slug> [<title>]
# Example: .\scripts\publish-review.ps1 "D:\tmp\offer-v2.html" "offer-v2" "CW Offer V2"
#
# Does: copy -> commit -> push -> regenerate index -> prints live URL
#
# SLUG = PAGE IDENTITY (fixed 2026-08-07, bug flagged by lighthouse-02 on an unrelated
# republish, bus msg #737). Reusing the same slug is the deliberate, explicit signal for
# "update this page" -- typing the exact same slug string twice is not an accident, and
# per this repo's ONE-CANONICAL-PAGE-PER-PURPOSE hard rule (agentsHQ CLAUDE.md, "DECISION/
# ACTION PAGES NEED A REAL DATABASE FROM V1" section) a slug already IS a page's canonical
# id. So the default on a slug collision is now an in-place UPDATE: same URL, refreshed
# content, the SAME manifest row updated (not a duplicate row appended).
#
# The OLD default silently forked a numbered "-2" duplicate on every single republish of
# the same page -- exactly the failure the canonical-page rule exists to prevent. Confirmed
# live casualty: review/20260622-faceless-music-brief vs review/20260622-faceless-music-brief-2,
# identical manifest title, the original now stranded in review/archive/ where nobody would
# think to look for it and its original URL 404s.
#
# Pass -DifferentPage only when you KNOW the collision is with a genuinely unrelated page
# (not a republish) and you want a distinct new page minted instead of overwriting -- even
# then, prefer just choosing a unique slug explicitly over relying on the auto-suffix.
#
# Pass -DryRun to run the full copy/stamp/manifest/index-rebuild pipeline without the git
# add/commit/push step, for safe local verification against a scratch review/ tree.

param(
    [Parameter(Mandatory)][string]$SourceFile,
    [Parameter(Mandatory)][string]$Slug,
    [string]$Title = "",
    [string]$Version = "v1",
    [switch]$DifferentPage,
    [switch]$DryRun
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

# Track whether the caller explicitly passed -Title (vs the slug-derived default below) --
# an in-place update must not clobber a human-set manifest title with a re-derived one.
$TitleWasExplicit = $PSBoundParameters.ContainsKey('Title') -and [bool]$Title

# Default title from slug
if (-not $Title) { $Title = $Slug -replace '-', ' ' | ForEach-Object { (Get-Culture).TextInfo.ToTitleCase($_) } }

# Slug collision handling. Default = update the existing page in place (see header note).
# -DifferentPage = mint a distinct numbered slug instead, looping past any earlier "-2"/"-3"
# so a second collision can never silently clobber an already-minted variant.
$IsUpdate = $false
if (Test-Path (Join-Path $SlugDir "index.html")) {
    if ($DifferentPage) {
        $baseSlug = $Slug
        $n = 2
        do {
            $Slug = "$baseSlug-$n"
            $SlugDir = Join-Path $ReviewDir $Slug
            $n++
        } while (Test-Path (Join-Path $SlugDir "index.html"))
        Write-Warning "Slug '$baseSlug' already exists and -DifferentPage was passed -- minting a distinct page at '$Slug' instead. Prefer choosing a unique slug explicitly next time."
        $LiveUrl = "https://boubacarbarry.com/review/$Slug/"
    } else {
        $IsUpdate = $true
        Write-Host "Slug '$Slug' already published -- updating the existing page in place (republish)." -ForegroundColor Cyan
    }
}

New-Item -ItemType Directory -Path $SlugDir -Force | Out-Null
Copy-Item $SourceFile (Join-Path $SlugDir "index.html") -Force

# HARD RULE (feedback_review_pages_version_deploy_stamp): auto-inject the version +
# deploy-timestamp stamp (upper-right) so every review page is stamped at publish time.
# No one can forget it -- it is part of the flow, not a manual step.
& (Join-Path $PSScriptRoot "inject-deploy-stamp.ps1") (Join-Path $SlugDir "index.html") $Version

# Update manifest -- same row updated on republish, never a duplicate appended.
$manifest = if (Test-Path $ManifestPath) {
    @(Get-Content $ManifestPath -Raw | ConvertFrom-Json)
} else { @() }

if ($IsUpdate) {
    $existing = @($manifest | Where-Object { $_.slug -eq $Slug }) | Select-Object -First 1
    if ($existing) {
        if ($TitleWasExplicit) { $existing.title = $Title } else { $Title = $existing.title }
        # Republish = fresh content -- reset the staleness/auto-archive clock and bring the
        # page back to active if it had been closed/archived at the manifest level. (A
        # separate human Keep/Archive decision recorded in Supabase review_states, if any,
        # is a different authority and is untouched by this -- see rebuild-review-index.ps1
        # Get-EffArchived.)
        $existing.created = $Today
        $existing.closed = $null
        $existing.archived = $false
        Write-Host "Manifest: updated existing row for '$Slug' (title kept unless -Title was passed)."
    } else {
        # Defensive fallback: the page existed on disk but had no manifest row (e.g. the
        # row was hand-removed after the folder was created). Insert one rather than error.
        $manifest = @($manifest) + @([PSCustomObject]@{
            slug     = $Slug
            title    = $Title
            created  = $Today
            closed   = $null
            archived = $false
        })
        Write-Warning "No manifest row found for existing slug '$Slug' -- inserted a fresh one."
    }
} else {
    $manifest = @($manifest) + @([PSCustomObject]@{
        slug     = $Slug
        title    = $Title
        created  = $Today
        closed   = $null
        archived = $false
    })
}
$manifest | ConvertTo-Json -Depth 3 | Set-Content $ManifestPath -Encoding UTF8

# Regenerate index
& (Join-Path $PSScriptRoot "rebuild-review-index.ps1")

# Commit + push
if ($DryRun) {
    Write-Host ""
    Write-Host "[DryRun] Skipping git add/commit/push." -ForegroundColor Yellow
} else {
    Set-Location $RepoRoot
    git add "review/$Slug/" "review/index.html" "review/.review-manifest.json"
    $verb = if ($IsUpdate) { "update" } else { "publish" }
    git commit -m "review: $verb $Slug ($Today)"
    git push origin main
}

Write-Host ""
Write-Host "LIVE: $LiveUrl" -ForegroundColor Green
Write-Host "Post this URL in chat for Boubacar to review on his phone."
