// Browser tests for the deck.
//   npm i puppeteer-core@23
//   node serve.mjs 3000 &            (decks load over fetch, so no file://)
//   node tests.mjs [screenshot-dir]  (CHROME=/path/to/chrome to override)
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://localhost:3000/';
const STORY = BASE + '?deck=demo-story';
const PROPOSAL = BASE + '?deck=demo-proposal';
const OUT = process.argv[2];
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: process.env.CHROME_ARGS?.split(' ') });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const state = () => page.evaluate(() => ({ hash: location.hash, section: document.querySelector('[data-current-section]').textContent, y: Math.round(scrollY) }));
const results = [];
const check = (name, ok, info) => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(info)}`);
// Rendering is async (deck is fetched); wait until scenes exist
const goto = async (url) => { await page.goto(url); await page.waitForSelector('.scene'); await wait(300); };

// ============ Fluid stage (demo-story) ============
await page.setViewport({ width: 1440, height: 900 });
await goto(STORY);
check('boot hash', (await state()).hash === '#/start', await state());
check('stage attribute', await page.evaluate(() => document.documentElement.dataset.stage) === 'fluid', {});
check('deck title from frontmatter', await page.evaluate(() => document.title) === 'Web deck', {});

await page.keyboard.press('ArrowDown'); await wait(900);
check('arrow advances', (await state()).hash === '#/why', await state());

await page.keyboard.down('Shift'); await page.keyboard.press('Space'); await page.keyboard.up('Shift'); await wait(900);
check('shift+space goes back', (await state()).hash === '#/start', await state());

// Long jump: record every hash the chrome passes through
await page.evaluate(() => { window.__seen = []; new MutationObserver(() => __seen.push(document.querySelector('[data-current-section]').textContent)).observe(document.querySelector('[data-current-section]'), { childList: true, characterData: true, subtree: true }); });
await page.keyboard.press('End'); await wait(900);
const seen = await page.evaluate(() => __seen);
check('End jumps without sweeping chrome', (await state()).hash === '#/end' && seen.length <= 1, { ...(await state()), seen });

await page.keyboard.press('Home'); await wait(600);
check('Home', (await state()).hash === '#/start', await state());

// Space on focused Present button should not advance
await page.focus('[data-present-toggle]'); await page.keyboard.press('Space'); await wait(900);
check('space on button does not advance', (await state()).hash === '#/start', await state());
await page.evaluate(() => document.body.classList.contains('is-presenting') && document.querySelector('[data-present-toggle]').click());
await page.evaluate(() => document.activeElement.blur());

// Deep link
await goto(STORY + '#/tall');
const tallTop = await page.evaluate(() => document.getElementById('tall').offsetTop);
check('deep link', (await state()).y === tallTop, { ...(await state()), tallTop });

// Free scroll inside tall scene
const tallH = await page.evaluate(() => document.getElementById('tall').offsetHeight);
await page.evaluate((y) => scrollTo(0, y), tallTop + 60); await wait(800);
let s = await state();
check(`inside tall scene stays put (tallH=${tallH})`, Math.abs(s.y - (tallTop + 60)) < 5 && s.hash === '#/tall', s);

// Mid-normal-scene should snap
const whyTop = await page.evaluate(() => document.getElementById('why').offsetTop);
await page.evaluate((y) => scrollTo(0, y), whyTop + 300); await wait(800);
s = await state();
check('normal scene snaps', s.y === whyTop || s.y === whyTop + 900, { ...s, whyTop });

// Arrow down from the tall scene pages within it, then leaves
await goto(STORY + '#/tall');
await page.keyboard.press('ArrowDown'); await wait(900);
check('1st arrow in tall pages within it', (await state()).hash === '#/tall' && Math.abs((await state()).y - (tallTop + tallH - 900)) <= 1, await state());
await page.keyboard.press('ArrowDown'); await wait(900);
check('2nd arrow leaves tall scene', (await state()).hash === '#/next', await state());

// Phone: tall scene is much taller; count presses to get through
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await goto(STORY + '#/tall');
const ph = await page.evaluate(() => document.getElementById('tall').offsetHeight);
let presses = 0;
while ((await state()).hash === '#/tall' && presses < 10) { await page.keyboard.press('ArrowDown'); await wait(900); presses++; }
check(`phone: tall scene (${ph}px) paged through in ${presses} presses`, (await state()).hash === '#/next' && presses === Math.ceil((ph - 844) / (844 * 0.85)) + 1, await state());
await page.keyboard.press('ArrowUp'); await wait(900);
check('phone: ArrowUp back into tall scene', (await state()).hash === '#/tall', await state());
await page.setViewport({ width: 1440, height: 900 });

// Numeric hash
await goto(STORY + '#/2');
check('numeric hash', (await state()).hash === '#/scenes', await state());

// Markdown rendering
const md = await page.evaluate(() => ({
  heading: document.querySelector('#scenes .slot-text > h2.slot-heading')?.textContent,
  eyebrow: document.querySelector('#scenes .slot-text > .slot-eyebrow')?.textContent,
  caption: document.querySelector('#scenes figure.slot-media figcaption')?.textContent,
  ratio: document.querySelector('#scenes .media-placeholder')?.style.getPropertyValue('--ratio'),
  focus: document.querySelector('#full img.media')?.style.getPropertyValue('--focus'),
  listItems: document.querySelectorAll('#tall ol.slot-list > li').length,
  kbd: !!document.querySelector('#end .slot-body kbd'),
  tall: document.getElementById('tall').hasAttribute('data-tall'),
  flip: document.getElementById('chrome').hasAttribute('data-flip'),
}));
check('markdown → slots', md.heading === 'The unit is a scene, not a slide' && md.eyebrow === 'Scenes' && md.caption?.startsWith('Media declares')
  && md.ratio.trim() === '4/3' && md.focus.trim() === '75% 35%' && md.listItems === 10 && md.kbd && md.tall && md.flip, md);

// Grid overlay
await page.evaluate(() => localStorage.clear());
await goto(STORY + '#/scenes');
const overlayState = () => page.evaluate(() => ({
  hidden: document.querySelector('[data-grid-overlay]').hidden,
  pressed: document.querySelector('[data-grid-toggle]').getAttribute('aria-pressed'),
  cols: [...document.querySelectorAll('[data-grid-overlay] span')].filter(s => s.offsetWidth).length,
}));
check('grid hidden by default', (await overlayState()).hidden === true, await overlayState());
await page.click('[data-grid-toggle]'); await wait(100);
check('grid button shows 12 cols', (await overlayState()).hidden === false && (await overlayState()).cols === 12 && (await overlayState()).pressed === 'true', await overlayState());
await page.reload(); await page.waitForSelector('.scene'); await wait(400);
check('grid persists across reload', (await overlayState()).hidden === false, await overlayState());
// Slot edges sit on overlay column edges
const edges = await page.evaluate(() => {
  const cols = [...document.querySelectorAll('[data-grid-overlay] span')].map(s => s.getBoundingClientRect());
  const r = (sel) => document.querySelector(sel).getBoundingClientRect();
  const t = r('#scenes .slot-text'), m = r('#scenes .slot-media'), ft = r('#chrome .slot-text'), fm = r('#chrome .slot-media');
  const d = (a, b) => Math.round(Math.abs(a - b));
  return { textL: d(t.left, cols[0].left), textR: d(t.right, cols[3].right), mediaL: d(m.left, cols[5].left), mediaR: d(m.right, cols[11].right),
           flipMediaL: d(fm.left, cols[0].left), flipMediaR: d(fm.right, cols[6].right), flipTextL: d(ft.left, cols[8].left) };
});
check('slots align to overlay columns (px off)', Object.values(edges).every(v => v <= 1), edges);
await page.keyboard.press('g'); await wait(100);
check('G key hides grid', (await overlayState()).hidden === true, await overlayState());
// Changing isMobile makes Puppeteer reload the page; wait for the deck to render again
await page.setViewport({ width: 390, height: 844, isMobile: true });
await page.waitForSelector('.scene'); await wait(300);
await page.keyboard.press('g'); await wait(200);
check('phone shows 4 cols', (await overlayState()).cols === 4, await overlayState());
const phoneEdges = await page.evaluate(() => {
  const cols = [...document.querySelectorAll('[data-grid-overlay] span')].map(s => s.getBoundingClientRect());
  const t = document.querySelector('#scenes .slot-text').getBoundingClientRect();
  return { L: Math.round(t.left - cols[0].left), R: Math.round(t.right - cols[3].right) };
});
check('phone slots span the 4 cols', Math.abs(phoneEdges.L) <= 1 && Math.abs(phoneEdges.R) <= 1, phoneEdges);
await page.evaluate(() => localStorage.clear());

// Every text block's last glyph baseline sits on a grid line (scene-relative)
for (const [w, h] of [[390, 844], [1440, 900], [1440, 800], [1920, 1080]]) {
  await page.setViewport({ width: w, height: h });
  await goto(STORY);
  await page.evaluate(() => document.fonts.ready); await wait(200);
  const worst = await page.evaluate(() => {
    const B = parseFloat(getComputedStyle(document.body).lineHeight);
    let worst = { err: 0 };
    for (const s of document.querySelectorAll('.scene:not([data-layout="media-full"])')) {
      const st = s.getBoundingClientRect().top;
      for (const el of s.querySelectorAll('.slot-eyebrow, .slot-heading, .slot-body, .slot-list > li, figcaption')) {
        const probe = document.createElement('span');
        probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        el.append(probe);
        const n = (probe.getBoundingClientRect().top - st) / B; probe.remove();
        const err = Math.abs(n - Math.round(n)) * B;
        if (err > worst.err) worst = { err: +err.toFixed(2), scene: s.id, el: el.className || el.tagName };
      }
    }
    return worst;
  });
  check(`${w}x${h}: glyph baselines on grid (<0.5px)`, worst.err < 0.5, worst);
}

// ============ Fixed stage (demo-proposal) ============
for (const [w, h] of [[1440, 900], [390, 844], [1920, 1080]]) {
  await page.setViewport({ width: w, height: h });
  await goto(PROPOSAL + '#/phases');
  const f = await page.evaluate(() => {
    const root = document.documentElement;
    const c = document.querySelector('#phases .scene__canvas').getBoundingClientRect();
    const chrome = document.querySelector('.chrome--top').getBoundingClientRect();
    return {
      stage: root.dataset.stage,
      scale: +getComputedStyle(root).getPropertyValue('--stage-scale'),
      ratio: +(c.width / c.height).toFixed(3),
      inside: c.left >= 0 && c.right <= innerWidth + 1 && c.top >= chrome.bottom - 1 && c.bottom <= innerHeight + 1,
      centred: Math.abs((c.left + c.right) / 2 - innerWidth / 2) <= 1,
      cols: document.querySelector('#phases .slot-left').getBoundingClientRect().right <= document.querySelector('#phases .slot-right').getBoundingClientRect().left,
      hash: location.hash,
    };
  });
  check(`${w}x${h}: fixed canvas scaled, 16:9, inside viewport, centred`, f.stage === 'fixed' && f.scale > 0 && Math.abs(f.ratio - 16 / 9) < 0.01 && f.inside && f.centred && f.cols && f.hash === '#/phases', f);
}
await page.setViewport({ width: 1440, height: 900 });
await goto(PROPOSAL);
await page.keyboard.press('ArrowDown'); await wait(900);
check('fixed: arrow advances', (await state()).hash === '#/approach', await state());

check('no page errors', errors.length === 0, errors);
console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

// Screenshots
if (OUT) {
  for (const [name, w, h, m] of [['phone', 390, 844, 3], ['laptop', 1440, 900, 1], ['tv', 1920, 1080, 1]]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: m > 1 ? 2 : 1, isMobile: m > 1 });
    await goto(STORY);
    await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
    await goto(PROPOSAL);
    await page.screenshot({ path: `${OUT}/${name}-proposal.png` });
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
