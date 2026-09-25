# LinkedIn banner -- editable template

**Pattern for all future banner/graphic work (standing convention, 2026-09-25):** every banner we ship saves BOTH the flattened export (PNG) AND this kind of editable source. Never let the only surviving artifact be a flattened image -- a future wording change should be a one-line edit + one render, not a from-scratch design pass.

## Files

- `template.html` -- the editable source. Headline lines, CTA button text, and the URL are all set in the `:root { ... }` CSS custom properties at the top of the `<style>` block. Edit those, nothing else, to change the words.
- `export-latest-1584x396.png` -- the most recent flattened render of `template.html`, kept here for quick reference. The canonical delivered copy for a specific banner lives in that banner's own `review/<slug>/` folder (see below).

## How to re-render after an edit

1. Edit the values inside `:root { ... }` in `template.html` (e.g. `--line2: "constraint";`).
2. Serve the folder locally and screenshot it at exactly 1584x396 (LinkedIn banner spec):
   ```bash
   cd assets/design-templates/linkedin-banner
   python -m http.server 8931
   ```
   Then open `http://localhost:8931/template.html` in a browser sized to 1584x396 (or use Playwright: `browser_resize` to 1584x396, `browser_navigate` to the URL, `browser_take_screenshot`) and save the PNG.
3. Drop the new PNG into the relevant `review/<slug>/` folder next to the review page that shows it, and update that page's `<img src="...">` to point at the new file (do NOT re-embed as base64 -- keep the file external and referenced by path so it stays swappable).
4. Update `export-latest-1584x396.png` here to match, so this folder always shows the current design at a glance.

## Design reference (what this template reproduces)

- 1584x396 (LinkedIn profile banner spec)
- Dark teal radial gradient background (`#1F5C63` -> `#0A2C30`)
- Faint repeating geometric line/diamond texture on the left ~half, `#EAF3F2` at ~11% opacity
- Headline: Poppins ExtraBold (800), off-white `#F2EEE3` for the first lines, orange `#EFA13B` for the final accent line, right-aligned
- CTA: solid orange button (`#EFA13B` fill, `#16292C` text) + a plain-text URL to its right in `#F2EEE3`

## History

- 2026-09-22: original "Your bottleneck has a name. / Let's find it." banner shipped as a flattened base64 PNG inside the review page HTML -- no separate source file existed anywhere.
- 2026-09-25: Boubacar asked for the word swap "bottleneck" -> "constraint" (he had just posted content moving away from the word "bottleneck"). No editable source existed to make that a one-line change, so this template was built by reverse-engineering the shipped PNG's layout/colors/font in HTML+CSS, verified against the original pixel-for-pixel visually (Playwright screenshot at 1584x396, compared side by side), then used to render the new "Your constraint has a name." banner. This is now the canonical editable source going forward -- check here FIRST before rebuilding any LinkedIn banner from scratch.
