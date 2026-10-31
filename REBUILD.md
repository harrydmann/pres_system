# Web deck: rebuild notes

A compact spec, distilled from the exploration in this repo. Hand this file to the
implementer; it should be enough to build Phase 1 in one pass without re-exploring.
The reference implementation is `index.html`, `brand.css`, `styles.css` and `app.js` (about 400 lines total, no build step).

## What it is

A scroll-snapped web document (phone → TV) with a presenting mode layered on top.
The document is primary and presenting is a mode. It is not a scaled fixed-stage canvas.

## Structure

```html
<header class="chrome chrome--top">title · [data-current-section] · [data-present-toggle]</header>
<div class="chrome chrome--bottom"><div class="progress"><div data-progress></div></div></div>
<main class="deck">
  <section class="scene" id="why" data-layout="statement" data-section="Why">…slots…</section>
</main>
```

- Chrome is `position: fixed`, outside the scroll container, `pointer-events: none` except on its children.
- **The root (`html`) is the scroll container**, not a wrapper div. That keeps mobile address-bar collapse and overscroll native.
- Slot classes are shared across layouts: `slot-eyebrow`, `slot-heading`, `slot-body`, `slot-caption`, `slot-list`, `slot-text`, `slot-media`.

## Settled decisions and why

| Decision | Why / what was tried |
|---|---|
| `html { scroll-snap-type: y mandatory }`, scenes `snap-align: start; snap-stop: always; min-height: 100dvh` | One idea per screen. `dvh` not `vh`, because of mobile toolbars. |
| **Tall scenes keep their snap point** (`[data-tall]`: `min-height:auto; snap-stop:normal`) | ✗ `scroll-snap-align: none` (the "opt out" in the original plan) gets *skipped* under `mandatory`. ✓ A snap area taller than the viewport scrolls freely inside it. Verified in Chrome. |
| **Active scene = the one under the viewport's centre line**: one `IntersectionObserver` with `rootMargin: '-50% 0px -50% 0px'` | ✗ Comparing `intersectionRatio` across scenes is wrong for tall scenes (the ratio is relative to the *target*), and it needs bookkeeping. The centre-line version is about 5 lines. |
| One piece of state (`active` index). Scroll, keys and hash all write it; chrome and hash read it | Keeps scroll and keyboard from diverging. Set it eagerly on key press so chrome updates instantly; the observer confirms. |
| **Smooth scroll only for adjacent moves; `behavior:'instant'` for jumps** (Home/End/deep links) | ✗ Smooth long jumps sweep the section label and hash through every scene in between. This is simpler than a scroll lock or `scrollend`. |
| **Arrow keys page *within* a tall scene before leaving it** (scroll by `min(hidden, 0.85·vh)`) | Otherwise ↓ from the top of a tall scene skips its unseen content. |
| Hash `#/scene-id`, falling back to `#/index`; written with `history.replaceState`; read on boot and on `hashchange` | `replaceState` doesn't fire `hashchange`, so there's no loop. Set `history.scrollRestoration = 'manual'`, or the browser fights snap + hash on reload. |
| Media: `.media { aspect-ratio: var(--ratio); object-fit: cover; object-position: var(--focus) }` | Media declares its ratio and focal point; the layout picks the footprint. Verified: a phone crops around the subject. |
| Layouts via `data-layout`, placing slots on the shared column grid (✗ per-layout `grid-template-areas`, replaced). Narrow is the default; designed arrangements are added at `(min-width:48rem) and (orientation:landscape), (min-width:64rem)` | Phone portrait always stacks. The landscape clause lets a phone held sideways get the spread. |
| One fluid unit (`--baseline`); type and vertical space derive from it (see Type) + `--gutter` + `--measure: 36em` | See the open question on TV below. |
| Presenting mode = body class + Fullscreen API + idle-cursor timer (2.5s); title and section stay visible, only the buttons fade with the idle cursor (back on mouse move, hover or focus) | Exit via Esc, `f`, button, or leaving fullscreen (listen to `fullscreenchange`). |
| Chrome buttons are icons: Lucide SVGs pasted inline (ISC, no package), `stroke: currentColor` set in CSS | Icon-only, so each button needs `aria-label` + `title` (shortcut in the title). Two-state buttons carry both icons and `aria-pressed` picks one in CSS; JS only flips the attribute. Icons: `grid-3x3`, `presentation` / `x`. Button = square, 1 baseline across, `--radius: 2px`; icon 66% with `stroke-width:1` + `vector-effect: non-scaling-stroke` on the shapes (not inherited — putting it on `<svg>` does nothing) so the line is 1px at any size. Phone button is 24px: meets WCAG 2.2 AA target size, below the 44px comfort size. |

## Type: derived from the baseline, so every glyph sits on the grid

**The model:** the baseline is the only fluid unit. A text style is a pair of numbers, **lines** (baselines per line of text) and **leading**,
and its font size is derived from them. Line height is always a whole number of baselines, so text can't fall off the grid.

```css
--fluid: calc((100vw - 22.5rem) / 97.5);                              /* 0 at 360px → 1rem at 1920px */
--baseline: clamp(1.5rem, 1.5rem + 0.75 * var(--fluid), 2.25rem);     /* 24 → 36px */

:where(body, body *) {
  line-height: calc(var(--lines, 1) * var(--baseline));
  font-size:   calc(var(--lines, 1) * var(--baseline) / var(--leading, 1.5));
}
```

| Style | Narrow (lines @ leading) | Wide | Size: 390 / 1440 / 1920px |
|---|---|---|---|
| Small (caption, eyebrow, chrome) | 1 @ 1.8 | same | 13.5 / 18 / 20 |
| Body | 1 @ 1.5 | same | 16 / 21.5 / 24 |
| Heading | 2 @ 1.3 | 2 @ 1.15 | 37 / 56 / 63 |
| Display (title, statement, end) | 2 @ 1.1 | 3 @ 1.15 | 44 / 84 / 94 |

**Glyphs, not just line boxes, on the grid.** Where the alphabetic baseline sits inside a line box depends on the font,
so boxes on the grid don't put glyphs on it. The fix is pure CSS, with no font metrics:

```css
@supports (text-box: trim-both cap alphabetic) {
  :is(.slot-eyebrow, .slot-heading, .slot-body, .slot-caption, .slot-list > li, figcaption) {
    text-box: trim-both cap alphabetic;                              /* box = cap top … last baseline */
    padding-top: calc(round(up, 1cap, var(--baseline)) - 1cap);      /* first line → whole baselines */
  }
}
```

Each text block ends up a whole number of baselines tall, and its bottom edge is a baseline. Without support (Firefox),
line boxes are still on the grid and only the glyph phase is lost.

**Everything around the text is whole baselines too:**
- Space tokens: s = 1, m = 2, l = 3, xl = 5 baselines. Scene row-gap = 1. List gap = 1.
- Scene padding: top = chrome 2 + 2 clear (+ centring), bottom = 3.
- **Media in a figure:** `container-type: inline-size` on the figure, then
  `height: round(down, calc(100cqi / (var(--ratio))), var(--baseline))`. It crops a few px via `object-fit`.
- **Spreads align to the top** (`align-items: start`). Centring two whole-baseline blocks against each other can leave a half-line offset.
- **Vertical centring in JS** (about 15 lines): add `.js-centre` to `html`, which makes CSS `align-content: start`. Each scene then gets
  `--centre = floor((innerHeight − 7b − contentHeight) / 2 / b) · b`, added to its top padding. Run it on load, on resize and on `document.fonts.ready`.
  Read the baseline in px from `getComputedStyle(body).lineHeight`. Tall and media-full scenes are skipped.

**Measured:** every block's last glyph baseline is within 0.19px of a grid line, on every scene, at 390×844, 1440×900, 1440×800 and 1920×1080.
The method: append a zero-size inline-block with `vertical-align: baseline` to each text block and read its top.

**Trade-offs accepted:**
- Type scales in proportion to the baseline (×1.5 from phone to TV). Headings can't grow faster than body *within* a range;
  that happens only at the breakpoint, by changing lines and leading. ✗ The earlier Utopia-style dual-ratio scale
  (1.25 → √2) gave headings faster growth but couldn't sit on a grid: heading ÷ baseline ran from 1.3 to 1.9.
- Small text gets loose leading (1.8). It's fine for one-line captions and airy when they wrap.
- Side-by-side columns land on the same grid, but their first baselines can be a line apart (heading vs list in `sequence`).

**Approaches tried and dropped:**
- ✗ Font sizes first, line-height `round(up, …, rhythm)` with a quarter-baseline rhythm. Leading was fine,
  but heading lines fell between grid lines. With half-baseline the leading was too coarse (1.1 → 1.34). Rounding up also needed a −0.5px float fudge.
- ✗ CSS `align-content: center`: offset = free space ÷ 2, which lands anywhere. Measured 17.31 baselines on one scene.

## Grid and rhythm

**Columns: defined once, as a token on `:root`**, used by every `.scene` and by the overlay:

```css
--cols: 4;                                   /* 12 at the wide breakpoint */
--edge: max(0px, calc(var(--gutter) - var(--col-gap)));
--grid: [full-start] var(--edge) [content-start]
        repeat(var(--cols), [col] minmax(0, 1fr))
        [content-end] var(--edge) [full-end];
.scene { grid-template-columns: var(--grid); column-gap: var(--col-gap); }
.scene > * { grid-column: content; }        /* default; layouts narrow it */
```

- **Named lines on the edges only** (`full`, `content`), plus `col N` for column starts. Layouts read
  `grid-column: col 6 / content-end`. Full-bleed media is just `grid-column: full`, with no padding hacks.
  ✗ Per-layout semantic names (`[text-start]`, `[media-start]`) were considered. They'd force each layout to
  redefine the template, which breaks "defined once", so they were rejected.
- The gutter is an outer **track**, not scene padding, so full-bleed media and on-grid content share one template.
  The edge track is `gutter − col-gap` because the gap also applies between it and column 1.
- **4 columns narrow, 12 wide**, switching at the same single breakpoint as the spreads. On narrow screens every slot spans all 4,
  so the stack is on-grid. ✗ A third (8-column tablet) arrangement isn't worth a third set of placements per layout.
- Wide placements use one empty column as the spread gap: text `col 1 / span 4`, media `col 6 / content-end`;
  flipped: media `col 1 / span 7`, text `col 9 / content-end`; sequence `col 1 / span 4` + `col 6 / content-end`;
  title/statement heading `col 1 / span 8`, title body `col 1 / span 6`.
- **Gotcha: side-by-side slots need `grid-row: 1`.** Otherwise auto-placement drops the second slot to a new
  row whenever its column comes before the first one's (e.g. the flipped layout).
- `order: -1` puts media above text on narrow screens without changing the source order.

**Overlay** (grid icon button beside Present; key `G`; remembered in `localStorage`): a fixed `div`
with the same `--grid` template, 12 `span`s (CSS hides spans 5–12 below the breakpoint), and baselines
drawn with a `repeating-linear-gradient` of `--baseline`.
- **Gotcha:** pin each span with `grid-column: col N`. Pinning only the first one lets auto-placement put
  the rest in the edge track, and the overlay ends up one column out.
- Tests check that slot edges match overlay column edges to within 1px at 1440px and 390px.

## Brand tokens (Deloitte, first pass)

All brand values live in **`brand.css`** (colours incl. dark mode, font stacks, display weight), plus two things it can't hold:
the font `<link>` in `index.html` (a CSS `@import` would chain the request) and the logo file `media/brand-mark.svg`.
`styles.css` is brand-free, so system changes port between repos without touching brand.

Unofficial: nothing authoritative is published, so verify these on the internal brand site.
- **Open Sans** for everything. Headlines use Light (`--weight-display: 300`), as deloitte.com does. Fallbacks: Aptos, Helvetica, Arial.
  Loaded as a Google Fonts variable font (300–800, `display=swap`). For work, consider self-hosting the file.
  The centring JS re-runs on `document.fonts.ready`, so the swap doesn't knock text off the grid (re-tested: within 0.17px).
- **Colour:** white/black, neutral greys (muted `#5e5e5e` on white, `#a6a6a6` on black), and accent `#86bc24`.
  The green is about 2:1 on white, so it goes on **marks only** (progress bar, overlay, borders), never on text.
- **Logo mark:** fixed bottom-right in `.chrome--bottom` as `<picture class="brand-mark"><img src="media/brand-mark.svg" alt=""></picture>`; 1 baseline square, `right: var(--gutter); bottom: var(--baseline)`, so it sits in the scene's 3-baseline bottom padding, clear of content and the media-full caption, and stays visible while presenting. The exploration repo uses a placeholder: get the official "D." mark (and its reversed/dark version, clear-space and minimum-size rules) from the internal brand portal. Logo-aggregator sites are unofficial and often not licensed for commercial use. Add the dark version as `<source media="(prefers-color-scheme: dark)">`.

## Keyboard rules (all needed; each was a bug)

- Ignore when `metaKey/ctrlKey/altKey` is held.
- Ignore when the target is inside `input, textarea, select, [contenteditable]` (otherwise `f` toggles presenting while typing).
- Ignore **Space** when the target is inside `button, a` (otherwise Space on Present both toggles *and* advances).
- `Shift+Space` goes back.
- `g` toggles the grid overlay.
- ↓ → PgDn Space: `advance(+1)`; ↑ ← PgUp: `advance(-1)`; Home/End: `go(0|last)`; `f`: present; Esc: exit present.

## Layouts (the six)

`title` (display heading, max 14ch) · `statement` (one display line, max 18ch) ·
`text-media` (stack media→text; spread 5fr/7fr; `data-flip` mirrors) ·
`media-full` (no padding, single grid area stacking media + caption over a gradient) ·
`sequence` (heading + `ol`; side by side at ≥64rem) · `end` (centred).

## Verification

Use headless Chrome via `puppeteer-core` pointed at the system Chrome; no server is needed over `file://`.
The test script from the exploration covers boot hash, arrows, Shift+Space, End with no chrome sweep, Home,
Space on a focused button, deep link, free scroll inside a tall scene, snapping mid-scene,
paging through a tall scene (laptop and phone), and numeric hash. Run it at 390×844, 1440×900 and 1920×1080.
Full-page screenshots draw fixed chrome only once, at the top; that's expected.

## Open questions (decide before or in Phase 2)

- **TV scaling.** The scale is width-based and caps at 1920px, so a TV looks like a big laptop, and short landscape screens get no extra room.
  Candidate: base `--fluid` on `min(100vw, 100vh·16/9)`. That's a one-line change now that every token shares `--fluid`.
- **Steps (Phase 2).** Extend state to `(scene, step)` and the hash to `#/id/step`. `advance()` already exists as the
  single entry point; it should consume steps before paging within or leaving a scene.
  When scrolling, does reaching a scene reveal all its steps, or are steps scroll-driven? Not decided.
- **Safari.** Untested. Check `behavior:'instant'`, `100dvh` and snap with tall areas on iOS.

## Syncing to the work repo

This repo is public (MIT) and serves as the **reference implementation**. The work repo is a separate copy with real
brand assets and content. **Port changes; never fork or merge** (forks of public repos must stay public, and the
histories will diverge). Keep work-only things (official tokens, logo, deck content) out of this repo.

Record the last synced commit in the work repo, e.g. a line `synced-from: <sha>` in its notes file.

The work machine may have no git (macOS without Xcode command line tools). Everything below works over plain HTTPS
with `curl`; no git and no GitHub login needed, because the repo is public.

**First build** (work machine agent):
> Download https://github.com/harrydmann/pres_system/archive/refs/heads/main.tar.gz into a scratch folder and unpack it.
> Read REBUILD.md and build from it, using the reference files only where the spec is unclear. Use our own brand.css and logo.
> Get the commit it came from with `curl -s https://api.github.com/repos/harrydmann/pres_system/commits/main` (field `sha`)
> and record it as `synced-from`.

A tarball has no commit hash inside it, so always record the sha from the API at the same time as downloading.

**Later updates:**
> Fetch https://github.com/harrydmann/pres_system/compare/<synced-from>...main.patch. It contains every new commit's
> message and diff. Port each change into our repo by hand (don't merge), skipping `brand.css` and `media/brand-mark.svg`.
> Run our tests, then set `synced-from` to the latest sha from the commits API.

(With git available, `git log`/`git diff <synced-from>..HEAD` on a clone gives the same thing.)

Reading only the diff keeps an update to a few hundred lines of context. Descriptive commit messages here matter,
because the work agent relies on them to understand intent.
