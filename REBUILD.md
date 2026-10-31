# Web deck: rebuild notes

A compact spec, distilled from the exploration in this repo. Hand this file to the
implementer; it should be enough to build Phase 1 in one pass without re-exploring.
The reference implementation is `index.html`, `styles.css` and `app.js` (about 400 lines total, no build step).

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
| One fluid type scale (5 steps, `clamp(rem, rem + vw, rem)`) + `--gutter` + `--measure: 36em`; spacing derives from the rhythm (see Grid and rhythm) | See the open question on TV below. |
| Presenting mode = body class + Fullscreen API + idle-cursor timer (2.5s); top chrome fades out and reappears on hover | Exit via Esc, `f`, button, or leaving fullscreen (listen to `fullscreenchange`). |

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

**Rhythm:** `--baseline: calc(var(--step-0) * 1.5)` (one body line); `--rhythm: calc(var(--baseline) / 4)`.
The space scale is in rhythm units (xs 2, s 4, m 6, l 12, xl 20). Every element's line-height rounds up to the rhythm:

```css
:where(body, body *) { line-height: round(up, calc(var(--leading, 1.5) * 1em), var(--rhythm)); }
.slot-heading { --leading: 1.1; }   .slot-caption, figcaption, .slot-eyebrow { --leading: 1.35; }
```

- It has to be applied **per element**. A line-height length set on `body` is inherited as an absolute value and
  ignores the child's own font size.
- ✗ **A half-baseline rhythm is too coarse.** A 50px heading's leading jumped from 1.1 to 1.34. A quarter works:
  headings are 1.11–1.15 on laptop and TV, about 1.27 on phone (acceptable at that size). Body is exactly 1.5.
- **Limitation: vertical centring breaks baseline *phase*.** `align-content: center` shifts content by an arbitrary
  amount, so lines are evenly spaced but sit between the overlay's baselines. CSS can't round that offset.
  Accepted: consistent spacing is the realistic goal, not true baseline alignment.

**Overlay** (`Grid` button beside `Present`; key `G`; remembered in `localStorage`): a fixed `div`
with the same `--grid` template, 12 `span`s (CSS hides spans 5–12 below the breakpoint), and baselines
drawn with a `repeating-linear-gradient` of `--baseline`.
- **Gotcha:** pin each span with `grid-column: col N`. Pinning only the first one lets auto-placement put
  the rest in the edge track, and the overlay ends up one column out.
- Tests check that slot edges match overlay column edges to within 1px at 1440px and 390px.

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

- **TV scaling.** The type scale is `vw`-based and caps at about 1920px, so a TV looks like a big laptop, and short landscape screens get no extra room.
  Candidate: base the fluid term on `min(vw, vh·1.6)`, or scale up only in presenting mode.
- **Steps (Phase 2).** Extend state to `(scene, step)` and the hash to `#/id/step`. `advance()` already exists as the
  single entry point; it should consume steps before paging within or leaving a scene.
  When scrolling, does reaching a scene reveal all its steps, or are steps scroll-driven? Not decided.
- **Safari.** Untested. Check `behavior:'instant'`, `100dvh` and snap with tall areas on iOS.
