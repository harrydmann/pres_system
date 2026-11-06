---
title: Web deck
stage: fluid
---

===
layout: title
section: Intro
id: start
===
:: eyebrow
A working scaffold
:: heading
A presentation that is also a web page
:: body
Scroll, swipe, or use the arrow keys. Every scene is a responsive layout — a spread on a wide screen, a well-set page on a phone.

===
layout: statement
section: Why
id: why
===
# One idea per scene. The whitespace is doing the work.

===
layout: text-media
section: How it works
id: scenes
===
:: eyebrow
Scenes
:: heading
The unit is a scene, not a slide
:: body
A scene fills the viewport and snaps into place. Inside it, a layout decides how text and media are arranged at each size — the author only chooses the layout and fills the slots.
:: media
[placeholder 4/3 4 : 3 media]
Media declares an aspect ratio; the layout decides the footprint.

===
layout: text-media
flip: true
section: How it works
id: chrome
===
:: eyebrow
Chrome
:: heading
Fixed elements live outside the scroll
:: body
The top strip shows the deck title and current section. The bottom edge is a progress bar. Both are the same on every scene and never move.
:: media
[placeholder 1 1 : 1 media]

===
layout: media-full
section: How it works
id: full
===
:: media
![](media/focal-demo.svg){focus="75% 35%"}
:: caption
Full-bleed media declares a focal point, so a phone in portrait crops around the subject instead of the centre.

===
layout: sequence
tall: true
section: How it works
id: tall
===
:: heading
A tall scene scrolls freely, then snaps on
:: list
1. Content taller than the viewport is allowed, but it is an escape hatch, not the norm.
2. The scene keeps its snap point at the top, so scrolling in from above still lands cleanly.
3. Inside it, scrolling is free. The browser will not snap mid-scene because the snap area is taller than the viewport.
4. Below it, the next scene snaps as normal.
5. Filler to make this tall on a laptop. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
6. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
7. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
8. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
9. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.
10. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.

===
layout: sequence
section: Next
id: next
===
:: heading
What comes next
:: list
1. Steps inside a scene — progressive reveal, driven by scroll or keyboard.
2. Transitions between scenes.
3. The fixed stage for proposals: see `?deck=demo-proposal`.

===
layout: end
section: End
id: end
===
:: heading
Thanks.
:: body
Press [[Home]] to go back to the start.
