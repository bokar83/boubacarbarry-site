# Design Audit — Profit &amp; Purpose (Dino-facing pitch page)

**Date:** 2026-08-21
**Path:** `profit-and-purpose/index.html` (live at `https://boubacarbarry.com/profit-and-purpose/`, password gated)
**Type:** HTML page, long-form, password-gated, single reader
**Audited at:** commit `7b48f0f`
**Method note:** the standard `fetch_url.py` path cannot reach this page (gate.php returns 401 to an unauthenticated fetch), so the audit was run against the source file plus rendered screenshots captured through the real gate in an isolated Chromium at 1280x900 and 375x780, light and dark, device_scale_factor 2 and 3. Contrast was measured on rendered pixels (crop each text element out of the painted page, histogram it, take the two dominant painted colours), not on CSS tokens. This file lives in the site repo rather than `workspace/design-audits/` because the canonical agentsHQ tree is read-only to this lane.

## Score: 19/20 — Excellent (ship as-is)

| Dimension | Score | One-line summary |
|---|---|---|
| Accessibility | 4/4 | Lowest measured rendered-pixel contrast is 5.53:1 against a 4.5 bar; heading order h1 to h2 to h3 with no skip; 5 `:focus-visible` rules; one image, meaningful alt; all 24 decorative SVGs `aria-hidden`; `main`/`nav`/`header` landmarks present; skip link first in DOM |
| Performance | 4/4 | Zero `@keyframes`, zero transitions except the reduced-motion reset, no layout-property animation, no webfont request at all (system serif and mono stack), 24 inline SVGs instead of images, one optional raster loaded via a JS probe |
| Theming | 4/4 | Every colour comes from a token; zero hard-coded hex outside `:root`; full light and dark palettes both defined at token level with a `data-theme` override in both directions; one type scale, one measure (`--measure:66ch`) |
| Responsive | 4/4 | `scrollWidth == innerWidth` at both 1280 and 375, so no horizontal overflow; hamburger confirmed opening at 375 with nav items measured at 44.8px; `.contact a` and `.fold summary` carry explicit 44px and 48px minimums; `clamp()` type throughout |
| Anti-Patterns | 3/4 | No AI tells in the palette, type, or layout. Loses one point for a 2px coloured `border-left` used as an accent in two places |

## Bands
18-20 Excellent (ship as-is) · 14-17 Good · 10-13 Acceptable · 6-9 Poor · 0-5 Critical

## Issues

### P0 (blockers)
None.

### P1 (high)
None.

### P2 (medium)
**[P2] [Anti-Patterns] `.article blockquote` and `.readersaid`** — 2px coloured `border-left` used as an accent stripe.
Impact: it is the one detail on the page that a designer could point at as a reflex. Both uses are typographically defensible (a pull quote and a quoted reader comment are the two places a vertical rule genuinely means "somebody else is talking"), and neither sits on a card, which is the version of the pattern that actually reads as slop.
Recommendation: leave as is unless the page gets another rebuild. If it does, replace the `.readersaid` rule with the same hand-inked SVG nib used by `.note`, which would make the "someone else is speaking" mark consistent across the page and remove the last straight-edge accent.

### P3 (low)
**[P3] [Accessibility] `.sample .hed`** — sample headlines are `<p class="hed">`, not headings.
Impact: a screen-reader user navigating by heading gets the section title but not the individual sample titles.
Recommendation: deliberate, because promoting five quoted artefact headlines into the document outline would bury the page's own six-section structure. The `.exhibit > .label` above each one carries the same information as text. Leave it; noted so it is a decision and not an oversight.

**[P3] [Responsive] `.fold .fm` hidden below 430px** — the reading-time estimate on each fold disappears on the smallest phones.
Impact: on a narrow phone the reader opens a fold without knowing whether it is three minutes or nine.
Recommendation: acceptable trade against wrapping the summary row onto two lines. Revisit only if he reads it on a phone and complains.

**[P3] [Performance] `backdrop-filter: saturate(140%) blur(8px)` on the sticky header** — one compositing-layer filter live during every scroll.
Impact: negligible here (one element, small area, no other filters on the page), but it is the single most expensive declaration in the stylesheet.
Recommendation: keep. The header already sets a 97% opaque `color-mix` background, so the blur could be dropped with almost no visual change if this ever needs to run on weak hardware.

## Anti-Pattern Tells
Checked against the full banned list. Present: **one** — 2px coloured `border-left` accent (P2 above).

Absent and verified by grep on the source: gradient text (0 `background-clip`), any gradient at all (0 `gradient`), glassmorphism as a default surface (`backdrop-filter` appears twice, both on the one sticky header), hero-metric template, identical card grids, modals, **em-dashes (0 in the entire file)**, bounce easing (0 `cubic-bezier`), purple-to-pink or blue-to-purple, Inter / DM Sans / Plus Jakarta / Space Grotesk (the stack is Iowan Old Style and a system mono, no webfont is requested), stock-photo hero, card-grid services section, monochrome logo strip, newsletter-signup-only CTA, four-column footer. Nothing is centred except nothing; every column is left-aligned to a 66ch measure.

## Category-Reflex Check
- **Business category:** ghostwriting pitch / personal portfolio.
- **Palette and theme:** ledger stock, a pale neutral biased green (`#EDEFE8`), ink `#191D16`, and one saturated colour only, an editor's-pencil red `#A61B2B`, spent exclusively on hand-drawn SVG rules and small mono labels. Two faces, both reading faces, no UI sans anywhere.
- **Could a stranger guess the category from the palette?** No. The reflex palette for a writing portfolio is warm cream with a serif display and a terracotta accent, which is on the banned list by name. This deliberately biases the neutral green instead of warm, and the accent is a correction pencil rather than a brand colour. The rules between sections are hand-drawn SVG paths with real wobble, not `border-top`, so nothing on the page is ruled by the browser. The concept is derived from the subject (a publication called Profit &amp; Purpose, hence accounting paper and an editor's mark) rather than from the category.

## Rendered-pixel contrast, measured
Light, 1280 and 375, and dark, 1280 and 375. Every text role sampled from the painted page.

| Role | Light | Dark | Bar |
|---|---|---|---|
| Body copy in a sample (`--ink` on `--card`) | 16.02:1 | 13.72:1 | 4.5 |
| Muted body (`--mute` on `--paper`) | 5.53:1 | 7.05:1 | 4.5 |
| Muted on card (`.slot`, `.readersaid`, fold meta) | 6.02:1 | 6.46:1 | 4.5 |
| Mono labels and rail (11.5px) | 5.53:1 | 7.05:1 | 4.5 |
| Accent label in a margin note | 6.44:1 | measured pass | 4.5 |
| Nav links | 5.58:1 | 7.11:1 | 4.5 |

**Failures: zero.** Three apparent failures in the first pass (`.label`, `.subjectline`, `.slot`) were measurement artefacts, not page defects, and were run to ground rather than waved off: the histogram threshold was discarding antialiased glyph pixels on small mono type, and one `.label` sample at 375 was taken with the hamburger panel painted over the element. Re-measured at device_scale_factor 3 with the panel closed, all three pass. This is exactly the failure mode the brief warned about, in reverse: a token check would have passed all three trivially and told us nothing.

## Recommendation
**Ship as is.** No P0 and no P1. The one P2 is a judgement call that is defensible where it sits, and the three P3s are recorded decisions rather than defects.
