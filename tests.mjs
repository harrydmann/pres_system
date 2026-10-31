// Browser tests for the deck. Run: npm i puppeteer-core@23 && node tests.mjs <screenshot-dir>
import puppeteer from 'puppeteer-core';
const PAGE = new URL("./index.html", import.meta.url).href;
const OUT = process.argv[2];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const state = () => page.evaluate(() => ({ hash: location.hash, section: document.querySelector('[data-current-section]').textContent, y: Math.round(scrollY) }));
const results = [];
const check = (name, ok, info) => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(info)}`);

await page.setViewport({ width: 1440, height: 900 });
await page.goto(PAGE); await wait(300);
check('boot hash', (await state()).hash === '#/start', await state());

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
await page.goto(PAGE + '#/tall'); await wait(400);
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

// Arrow down from the tall scene: does it reach #/end?
await page.goto(PAGE + '#/tall'); await wait(400);
await page.keyboard.press('ArrowDown'); await wait(900);
check('1st arrow in tall pages within it', (await state()).hash === '#/tall' && (await state()).y === tallTop + tallH - 900, await state());
await page.keyboard.press('ArrowDown'); await wait(900);
check('2nd arrow leaves tall scene', (await state()).hash === '#/next', await state());

// Phone: tall scene is much taller; count presses to get through
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.goto(PAGE + '#/tall'); await wait(400);
const ph = await page.evaluate(() => document.getElementById('tall').offsetHeight);
let presses = 0;
while ((await state()).hash === '#/tall' && presses < 10) { await page.keyboard.press('ArrowDown'); await wait(900); presses++; }
check(`phone: tall scene (${ph}px) paged through in ${presses} presses`, (await state()).hash === '#/next' && presses === Math.ceil((ph - 844) / (844*0.85)) + 1, await state());
await page.keyboard.press('ArrowUp'); await wait(900);
check('phone: ArrowUp back into tall scene', (await state()).hash === '#/tall', await state());
await page.setViewport({ width: 1440, height: 900 });

// Numeric hash
await page.goto(PAGE + '#/2'); await wait(400);
check('numeric hash', (await state()).hash === '#/scenes', await state());

// Grid overlay
await page.setViewport({ width: 1440, height: 900 });
await page.evaluate(() => localStorage.clear());
await page.goto(PAGE + '#/scenes'); await wait(400);
const overlayState = () => page.evaluate(() => ({
  hidden: document.querySelector('[data-grid-overlay]').hidden,
  pressed: document.querySelector('[data-grid-toggle]').getAttribute('aria-pressed'),
  cols: [...document.querySelectorAll('[data-grid-overlay] span')].filter(s => s.offsetWidth).length,
}));
check('grid hidden by default', (await overlayState()).hidden === true, await overlayState());
await page.click('[data-grid-toggle]'); await wait(100);
check('grid button shows 12 cols', (await overlayState()).hidden === false && (await overlayState()).cols === 12 && (await overlayState()).pressed === 'true', await overlayState());
await page.reload(); await wait(400);
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
await page.setViewport({ width: 390, height: 844, isMobile: true });
await page.keyboard.press('g'); await wait(200);
check('phone shows 4 cols', (await overlayState()).cols === 4, await overlayState());
const phoneEdges = await page.evaluate(() => {
  const cols = [...document.querySelectorAll('[data-grid-overlay] span')].map(s => s.getBoundingClientRect());
  const t = document.querySelector('#scenes .slot-text').getBoundingClientRect();
  return { L: Math.round(t.left - cols[0].left), R: Math.round(t.right - cols[3].right) };
});
check('phone slots span the 4 cols', Math.abs(phoneEdges.L) <= 1 && Math.abs(phoneEdges.R) <= 1, phoneEdges);
await page.evaluate(() => localStorage.clear());

console.log(results.join('\n'));

// Screenshots
for (const [name, w, h, m] of [['phone', 390, 844, 3], ['laptop', 1440, 900, 1], ['tv', 1920, 1080, 1]]) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: m > 1 ? 2 : 1, isMobile: m > 1 });
  await page.goto(PAGE); await wait(400);
  await page.screenshot({ path: `${OUT}/${name}-full.png`, fullPage: true });
}
await browser.close();
