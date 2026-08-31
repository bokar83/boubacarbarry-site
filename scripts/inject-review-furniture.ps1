# inject-review-furniture.ps1 -- inject the non-negotiable review-page furniture that can
# be added SAFELY without knowing anything about the page's content.
#
# HARD RULE (feedback_html_deliverables_require_nav_collapse_backtotop_always_2026_07_28):
#   Every boubacarbarry.com/review/* page ships with a collapsible TL;DR at the top, a
#   toggle on every section, a back-to-top button, and a hamburger nav on mobile.
#
# THE REASON, in Boubacar's words (2026-08-11), which matters more than the checklist:
#   "The reason for the collapsible items is that I don't want to have to read 30 pages of
#    a TL;DR to get to the content every single time. I need to be able to just quickly
#    jump into this after future reviews."
#   => The page is designed for the SECOND visit. Whatever he collapsed last time must
#      STILL be collapsed when he comes back. That is a state problem, not a default-state
#      problem, and state is what this script installs.
#
# SPLIT OF RESPONSIBILITY (deliberate -- see validate-review-page.ps1 for the other half):
#   - Injected here, so no agent can ever forget it, on EVERY publish including legacy
#     pages being republished:
#       * the floating back-to-top button          (self-contained, needs no page structure)
#       * per-page collapse-state PERSISTENCE      (localStorage, keyed by path + section)
#       * an expand-all / collapse-all control     (one tap to reset either way)
#   - NOT injected, because it cannot be synthesised safely from an unknown DOM, so it is
#     VALIDATED and hard-fails the publish instead:
#       * the TL;DR being wrapped in a real collapsible
#       * every section having its own toggle
#       * the nav + mobile hamburger
#
# DEFAULT STATE, decided on purpose (do not "fix" this by accident):
#   FIRST visit  -> TL;DR open, every section open. The page reads top to bottom and
#                   hides nothing from someone seeing it for the first time.
#   REPEAT visit -> exactly the state he left it in. Collapse the TL;DR once and it stays
#                   collapsed on that page forever, which is literally the thing he asked
#                   for. A page that hid its content by default would trade his first-read
#                   problem for a worse one.
#   The stored state is VIEW state (what is folded), never decision data, so this does not
#   collide with the "decision pages need a real database from v1" hard rule -- nothing
#   here is a decision, a status, or an action, and losing it costs one tap.
#
# Idempotent: re-running strips the old block and writes a fresh one. Safe to run on any
# page repeatedly. No-ops gracefully on a page with no <details> elements.
#
# Usage: .\scripts\inject-review-furniture.ps1 <path-to-html-file>

param(
    [Parameter(Mandatory)][string]$HtmlFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path $HtmlFile)) {
    Write-Error "HTML file not found: $HtmlFile"
    exit 1
}

$startMarker = "<!-- REVIEW_FURNITURE_START (managed by scripts/inject-review-furniture.ps1 -- do not hand-edit) -->"
$endMarker   = "<!-- REVIEW_FURNITURE_END -->"

# Everything below is one self-contained block: no external CSS, no external JS, no fonts,
# no network. Review pages must stand alone -- they get opened from a phone on bad hotel
# wifi, and a shared include that 404s would take the back-to-top button down with it.
#
# NO-BLUE-LINKS SAFETY NET (2026-08-25, 5th violation of the standing rule -- see
# memory/feedback_no_blue_text_on_dark_background_except_hyperlinks_2026_07_21.md).
# scripts/templates/review-page-template.html now ships a correct base `a{color}` rule,
# but furniture injection runs on EVERY publish including pages that did NOT start from
# that template (hand-written pages, pages copy-pasted from an older page, pages built by
# an agent that skipped the template). This block is the backstop for those: it uses
# `:where(...)` so its specificity is ZERO -- lower than a plain `a` selector (0,0,1) --
# so it NEVER overrides a page's own intentional link colour, including a non-terracotta
# accent a page chose on purpose. It only fires when nothing else in the page's cascade
# claims the anchor at all, which is exactly the failure mode this rule exists to close
# (an unstyled `<a>` falling back to browser-default blue rgb(0,0,238)).
$block = @"
$startMarker
<style id="review-furniture-css">
  /* Base link-colour safety net -- see comment above. Zero-specificity fallback only;
     any page-authored `a{color:...}` rule (even at the same normal specificity) wins. */
  :where(a){color:#FF8F5E;}
  :where(a:visited){color:#B87333;}
  :where(a:hover),:where(a:active){color:#FFB08A;}
  /* Floating controls, bottom-right. Thumb-reachable on a phone, out of the way of the
     deploy stamp (which moves to bottom-LEFT under 560px). */
  #rf-controls{position:fixed;right:14px;bottom:16px;z-index:99998;display:flex;
    flex-direction:column;gap:8px;align-items:flex-end;}
  #rf-controls button{appearance:none;-webkit-appearance:none;cursor:pointer;
    font:600 13px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
    color:#e7e9ee;background:rgba(28,32,42,0.92);border:1px solid rgba(236,226,210,0.22);
    border-radius:999px;padding:10px 14px;min-height:40px;
    box-shadow:0 4px 14px rgba(0,0,0,0.35);backdrop-filter:blur(6px);
    -webkit-backdrop-filter:blur(6px);transition:opacity .18s ease,transform .18s ease;}
  #rf-controls button:hover{transform:translateY(-1px);}
  #rf-controls button:focus-visible{outline:2px solid #FF8F5E;outline-offset:2px;}
  #rf-top{opacity:0;pointer-events:none;}
  #rf-top.rf-show{opacity:1;pointer-events:auto;}
  /* Phone: shrink the controls so they cover as little body text as possible, AND on
     mobile only, gate the fold-all button behind the same scroll threshold as back-to-top
     (2026-08-31 fix -- see memory/feedback for the incident). At the top of a page on a
     375px screen the first card can run right into the bottom-right corner where these
     controls float, so on load (scrollY 0) BOTH buttons now stay hidden instead of just
     back-to-top; they fade in together once he has actually scrolled, by which point the
     card that used to sit under them has scrolled out of the way. Desktop is untouched --
     this whole hide/show behaviour lives inside the mobile media query only.
     NOTE: the old `opacity:.93` on the shared button rule below used to silently win over
     `#rf-top{opacity:0}` (higher specificity: `#rf-controls button` beats a bare `#rf-top`
     inside this media query), which is WHY back-to-top was rendering fully visible over
     card text on mobile even at scrollY 0 despite the JS gating existing. Removed. */
  @media (max-width:560px){
    #rf-controls{right:10px;bottom:12px;gap:6px;}
    #rf-controls button{padding:0 11px;font-size:12px;}
    #rf-foldall{opacity:0;pointer-events:none;}
    #rf-foldall.rf-show{opacity:.93;pointer-events:auto;}
    #rf-top.rf-show{opacity:.93;}
  }
  @media (prefers-color-scheme: light){
    #rf-controls button{color:#1b1b1b;background:rgba(255,255,255,0.94);
      border-color:rgba(0,0,0,0.16);}
  }
  @media print{ #rf-controls{display:none !important;} }
</style>
<div id="rf-controls" role="group" aria-label="Page controls">
  <button type="button" id="rf-foldall" aria-label="Collapse or expand every section">Collapse all</button>
  <button type="button" id="rf-top" aria-label="Back to top">&#8593; Top</button>
</div>
<script id="review-furniture-js">
(function () {
  'use strict';

  // ---- back to top (+ mobile-only fold-all gating, same threshold) --------------
  var topBtn = document.getElementById('rf-top');
  var foldBtnEarly = document.getElementById('rf-foldall');
  function onScroll() {
    var show = (window.pageYOffset || document.documentElement.scrollTop) > 320;
    if (topBtn) { topBtn.classList.toggle('rf-show', show); }
    // rf-show only affects visibility of #rf-foldall inside the mobile media query
    // (see CSS above) -- on desktop this class is inert, so no behaviour change there.
    if (foldBtnEarly) { foldBtnEarly.classList.toggle('rf-show', show); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (topBtn) {
    topBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ---- fast re-entry: remember what he folded ----------------------------------
  // Key on the page path so every review page keeps its own memory, and on a stable
  // per-section key so reordering content does not scramble which sections were shut.
  var STORE = 'rf-fold:' + (location.pathname || 'page');

  function readState() {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writeState(s) {
    try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }

  function keyFor(d, i) {
    if (d.id) { return 'id:' + d.id; }
    var s = d.querySelector(':scope > summary');
    var label = s ? (s.textContent || '').trim().slice(0, 60) : '';
    return label ? 'sum:' + label : 'idx:' + i;
  }

  var details = Array.prototype.slice.call(document.querySelectorAll('details'));
  if (!details.length) {
    // Nothing collapsible on this page -- hide the fold-all control rather than lie
    // about what it does. Back-to-top still works.
    var fa0 = document.getElementById('rf-foldall');
    if (fa0) { fa0.style.display = 'none'; }
    return;
  }

  var state = readState();
  var restored = false;
  details.forEach(function (d, i) {
    var k = keyFor(d, i);
    d.setAttribute('data-rf-key', k);
    // FIRST visit (no stored value) -> leave the author's markup alone, which the
    // template ships fully OPEN. REPEAT visit -> restore exactly what he left.
    if (Object.prototype.hasOwnProperty.call(state, k)) {
      d.open = !!state[k];
      restored = true;
    }
    d.addEventListener('toggle', function () {
      var s = readState();
      s[d.getAttribute('data-rf-key')] = d.open;
      writeState(s);
      syncFoldLabel();
    });
  });

  // ---- expand all / collapse all -----------------------------------------------
  var foldBtn = document.getElementById('rf-foldall');
  function anyOpen() {
    return details.some(function (d) { return d.open; });
  }
  function syncFoldLabel() {
    if (!foldBtn) { return; }
    foldBtn.textContent = anyOpen() ? 'Collapse all' : 'Expand all';
  }
  if (foldBtn) {
    foldBtn.addEventListener('click', function () {
      var target = !anyOpen();          // if everything is shut, open everything
      var s = readState();
      details.forEach(function (d) {
        d.open = target;
        s[d.getAttribute('data-rf-key')] = target;
      });
      writeState(s);
      syncFoldLabel();
    });
    syncFoldLabel();
  }

  // If we restored a folded state, jump the reader back to the top so the page does
  // not open mid-content after the reflow.
  if (restored && !location.hash) { window.scrollTo(0, 0); }
})();
</script>
$endMarker
"@

$html = Get-Content $HtmlFile -Raw -Encoding UTF8

# Strip any existing block (idempotent republish).
$html = [regex]::Replace(
    $html,
    '(?s)<!-- REVIEW_FURNITURE_START.*?<!-- REVIEW_FURNITURE_END -->',
    ''
)

if ($html -match '(?i)</body\s*>') {
    $html = [regex]::Replace($html, '(?i)(</body\s*>)', ($block -replace '\$', '$$$$') + "`n" + '$1', 1)
} else {
    Write-Error "No </body> tag found in $HtmlFile -- cannot inject review furniture. The source must be a COMPLETE standalone HTML document."
    exit 1
}

Set-Content $HtmlFile $html -Encoding UTF8

# Verify it landed (never report an injection as done without re-reading the file).
$check = Get-Content $HtmlFile -Raw -Encoding UTF8
if ($check -notmatch [regex]::Escape('id="rf-top"') -or $check -notmatch [regex]::Escape('REVIEW_FURNITURE_END')) {
    Write-Error "Review-furniture injection failed verification for $HtmlFile."
    exit 1
}
Write-Host "Furniture injected: back-to-top + fold-state persistence + expand/collapse-all -> $HtmlFile"
