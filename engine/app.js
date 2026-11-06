/* =========================================================
   Engine — shared by every stage
   1. Load a deck (decks/<name>/deck.md), attach the stage's stylesheets,
      render scenes into the DOM
   2. One piece of state (active scene index). Scroll, keys and hash all
      write it; chrome and hash read it
   3. Presenting mode, grid overlay
   4. Stage hooks: baseline centring (when a stage defines --baseline on
      scenes) and fit-to-viewport scaling (when a stage defines
      --stage-width / --stage-height)
   ========================================================= */
(async () => {
  const root = document.documentElement;
  const deckEl = document.querySelector('[data-deck]');
  const titleEl = document.querySelector('[data-deck-title]');
  const sectionEl = document.querySelector('[data-current-section]');
  const progressEl = document.querySelector('[data-progress]');
  const presentBtn = document.querySelector('[data-present-toggle]');
  const gridBtn = document.querySelector('[data-grid-toggle]');
  const gridOverlay = document.querySelector('[data-grid-overlay]');

  // ---------- 1. Load ----------
  const params = new URLSearchParams(location.search);
  const deckName = params.get('deck') || deckEl.dataset.deck || 'demo-story';
  const deckBase = `decks/${deckName}/`;

  let source;
  try {
    const res = await fetch(`${deckBase}deck.md`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    source = await res.text();
  } catch (err) {
    deckEl.innerHTML = `<p class="deck-error">Could not load ${deckBase}deck.md\n${err.message}\n\nServe this folder over HTTP (node serve.mjs) — fetch() does not work from file://</p>`;
    return;
  }

  const deck = parseDeck(source);
  const stage = deck.meta.stage || 'fluid';
  root.dataset.stage = stage;
  await Promise.all(['tokens', 'stage', 'layouts'].map((f) => loadCss(`stages/${stage}/${f}.css`)));

  document.title = deck.meta.title || 'Deck';
  titleEl.textContent = deck.meta.title || '';

  deckEl.innerHTML = '';
  deck.scenes.forEach((scene, i) => deckEl.appendChild(renderScene(scene, i, deckBase)));
  const scenes = [...deckEl.querySelectorAll('.scene')];

  // ---------- 2. State ----------
  let active = 0;

  function render() {
    const scene = scenes[active];
    sectionEl.textContent = scene.dataset.section || '';
    progressEl.style.width = `${((active + 1) / scenes.length) * 100}%`;
    const id = scene.id || String(active);
    if (location.hash !== `#/${id}`) history.replaceState(null, '', `#/${id}`);
  }

  function setActive(i) {
    i = Math.max(0, Math.min(scenes.length - 1, i));
    if (i === active) return;
    active = i;
    render();
  }

  // Scroll → state. The scene under the viewport's horizontal centre line
  // wins: one observer, no ratio bookkeeping, correct for tall scenes.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) setActive(scenes.indexOf(e.target));
    }
  }, { rootMargin: '-50% 0px -50% 0px' });
  scenes.forEach((s) => io.observe(s));

  // Keyboard → state
  function go(i) {
    i = Math.max(0, Math.min(scenes.length - 1, i));
    // Smooth only between neighbours; longer jumps would sweep the chrome
    // through every scene in between.
    const behavior = Math.abs(i - active) === 1 ? 'smooth' : 'instant';
    scenes[i].scrollIntoView({ block: 'start', behavior });
    setActive(i); // eager; the observer confirms
  }

  // Within a tall scene, arrows page through it before leaving it.
  function pageWithin(dir) {
    const r = scenes[active].getBoundingClientRect();
    const vh = innerHeight;
    const hidden = dir > 0 ? r.bottom - vh : -r.top;
    if (hidden <= 1) return false;
    scrollBy({ top: dir * Math.min(hidden, vh * 0.85), behavior: 'smooth' });
    return true;
  }
  function advance(dir) {
    if (!pageWithin(dir)) go(active + dir);
  }

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable]')) return;
    // Let Space activate a focused button/link instead of also advancing.
    if (e.key === ' ' && e.target.closest('button, a')) return;
    switch (e.key) {
      case ' ':
        e.preventDefault(); advance(e.shiftKey ? -1 : 1); break;
      case 'ArrowDown': case 'ArrowRight': case 'PageDown':
        e.preventDefault(); advance(1); break;
      case 'ArrowUp': case 'ArrowLeft': case 'PageUp':
        e.preventDefault(); advance(-1); break;
      case 'Home': e.preventDefault(); go(0); break;
      case 'End':  e.preventDefault(); go(scenes.length - 1); break;
      case 'f': case 'F': togglePresent(); break;
      case 'g': case 'G': toggleGrid(); break;
      case 'Escape': if (document.body.classList.contains('is-presenting')) togglePresent(); break;
    }
  });

  // Hash → state (deep links, back/forward)
  function fromHash() {
    const id = location.hash.replace(/^#\/?/, '');
    if (!id) return;
    const i = /^\d+$/.test(id) ? Number(id) : scenes.findIndex((s) => s.id === id);
    if (i >= 0 && i < scenes.length) {
      scenes[i].scrollIntoView({ block: 'start', behavior: 'instant' });
      setActive(i);
    }
  }
  window.addEventListener('hashchange', fromHash);

  // ---------- 3. Presenting mode ----------
  let idleTimer;
  function togglePresent() {
    const on = document.body.classList.toggle('is-presenting');
    presentBtn.setAttribute('aria-pressed', String(on));
    presentBtn.title = on ? 'Exit (Esc)' : 'Present (F)';
    if (on) {
      root.requestFullscreen?.().catch(() => {});
      armIdle();
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.();
      document.body.classList.remove('is-idle');
      clearTimeout(idleTimer);
    }
  }
  function armIdle() {
    clearTimeout(idleTimer);
    document.body.classList.remove('is-idle');
    idleTimer = setTimeout(() => document.body.classList.add('is-idle'), 2500);
  }
  document.addEventListener('mousemove', () => {
    if (document.body.classList.contains('is-presenting')) armIdle();
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('is-presenting')) togglePresent();
  });
  presentBtn.addEventListener('click', togglePresent);

  // Grid overlay (design aid). 12 columns, each pinned to its own line;
  // the stage hides extras on narrow grids. html.show-grid lets a stage
  // draw its own aid (the fixed stage outlines the safe area).
  gridOverlay.append(...Array.from({ length: 12 }, (_, i) => {
    const col = document.createElement('span');
    col.style.gridColumn = `col ${i + 1}`;
    return col;
  }));
  function toggleGrid(on = gridOverlay.hidden) {
    gridOverlay.hidden = !on;
    root.classList.toggle('show-grid', on);
    gridBtn.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem('deck:grid', on ? '1' : ''); } catch {}
  }
  gridBtn.addEventListener('click', () => toggleGrid());
  try { if (localStorage.getItem('deck:grid') || params.has('grid')) toggleGrid(true); } catch {}

  // ---------- 4. Stage hooks ----------
  const cs = getComputedStyle(root);

  // Baseline centring (fluid stage). CSS centring offsets content by
  // (free space ÷ 2), which lands anywhere. Instead, top-align (CSS:
  // .js-centre) and pad by the largest whole number of baselines that
  // keeps the content centred. Body line-height = 1 baseline.
  if (cs.getPropertyValue('--baseline-centring').trim() === 'on') {
    const centreOnBaseline = () => {
      const b = parseFloat(getComputedStyle(document.body).lineHeight);
      for (const s of scenes) {
        if (s.matches('[data-tall], [data-layout="media-full"]')) continue;
        s.style.setProperty('--centre', '0px');
        const sc = getComputedStyle(s);
        const fixed = parseFloat(sc.paddingTop) + parseFloat(sc.paddingBottom);
        const items = [...(s.querySelector('.scene__canvas')?.children ?? s.children)];
        const boxes = items.map((c) => c.getBoundingClientRect());
        const content = Math.max(...boxes.map((r) => r.bottom)) - Math.min(...boxes.map((r) => r.top));
        const free = Math.max(0, innerHeight - fixed - content);
        s.style.setProperty('--centre', `${Math.floor(free / 2 / b) * b}px`);
      }
    };
    root.classList.add('js-centre');
    centreOnBaseline();
    addEventListener('resize', centreOnBaseline);
    document.fonts?.ready.then(centreOnBaseline);
  }

  // Fit-to-viewport scaling (fixed stage): scale = min(vw/W, vh/H)
  const stageW = parseFloat(cs.getPropertyValue('--stage-width'));
  const stageH = parseFloat(cs.getPropertyValue('--stage-height'));
  if (stageW && stageH) {
    const chromeH = document.querySelector('.chrome--top')?.offsetHeight || 0;
    const fit = () => {
      const pad = 8;
      const scale = Math.min((innerWidth - pad * 2) / stageW, (innerHeight - chromeH - 3 - pad * 2) / stageH);
      root.style.setProperty('--stage-scale', scale.toFixed(4));
    };
    fit();
    addEventListener('resize', fit);
  }

  // ---------- Boot ----------
  // Browser scroll restoration fights snap + hash; do it ourselves.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  fromHash();
  render();

  /* =========================================================
     Deck format (see REBUILD.md → Authoring)
     ---                       deck frontmatter: title, stage
     ===                       scene header: layout, section, id,
     layout: text-media        flip, tall (key: value lines)
     ===
     :: eyebrow                slot marker; content runs to the next marker
     :: heading
     :: body                   paragraphs, lists, **bold**, *em*, `code`, [[Key]]
     :: list                   a - or 1. list (rendered as the list element)
     :: media                  ![caption](src){ratio=4/3 focus=75% 35%}
                               [placeholder 4/3 label]
     :: caption
     Scenes without :: markers: "# line" → heading, rest → body.
     ========================================================= */

  function parseDeck(text) {
    text = text.replace(/\r\n/g, '\n');
    const meta = {};
    let rest = text;
    const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) { Object.assign(meta, parseKV(fm[1])); rest = text.slice(fm[0].length); }
    const scenes = [];
    const parts = rest.split(/^===\s*$/m);
    for (let i = 1; i < parts.length; i += 2) {
      const header = parseKV(parts[i]);
      const body = parts[i + 1] || '';
      scenes.push({ ...header, slots: parseSlots(body.trim()) });
    }
    return { meta, scenes };
  }

  function parseKV(block) {
    const out = {};
    for (const line of block.split('\n')) {
      const m = line.match(/^\s*([\w-]+)\s*:\s*(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  }

  function parseSlots(body) {
    const slots = [];
    if (!/^::\s*\w/m.test(body)) {
      const lines = body.split('\n');
      const heading = lines.filter((l) => /^#\s/.test(l)).map((l) => l.replace(/^#\s+/, '')).join('\n');
      const rest = lines.filter((l) => !/^#\s/.test(l)).join('\n').trim();
      if (heading) slots.push(['heading', heading]);
      if (rest) slots.push(['body', rest]);
      return slots;
    }
    const re = /^::\s*([\w-]+)\s*$/gm;
    let m, last = null;
    while ((m = re.exec(body))) {
      if (last) slots.push([last.name, body.slice(last.end, m.index).trim()]);
      last = { name: m[1], end: m.index + m[0].length };
    }
    if (last) slots.push([last.name, body.slice(last.end).trim()]);
    return slots;
  }

  // ---------- Rendering ----------
  // Slots render as flat elements carrying `slot slot-<name>` so layouts
  // can place each one on the grid. When a scene has media, the text
  // slots (eyebrow, heading, body, list) are grouped in a `.slot-text`
  // wrapper so a layout can place the text block as one unit.
  function renderScene(scene, index, base) {
    const TEXT_SLOTS = new Set(['eyebrow', 'heading', 'body', 'list']);
    const sec = document.createElement('section');
    sec.className = 'scene';
    sec.dataset.layout = scene.layout || 'statement';
    if (scene.section) sec.dataset.section = scene.section;
    if (scene.tall === 'true') sec.dataset.tall = '';
    if (scene.flip === 'true') sec.dataset.flip = '';
    sec.id = scene.id || `scene-${index + 1}`;

    const canvas = document.createElement('div');
    canvas.className = 'scene__canvas';
    sec.appendChild(canvas);

    const hasMedia = scene.slots.some(([n]) => n === 'media');
    let group = null;
    for (const [name, content] of scene.slots) {
      const els = renderSlot(name, content, index, base);
      if (hasMedia && TEXT_SLOTS.has(name)) {
        if (!group) { group = document.createElement('div'); group.className = 'slot slot-text'; canvas.appendChild(group); }
        group.append(...els);
      } else {
        canvas.append(...els);
      }
    }
    return sec;
  }

  function renderSlot(name, content, index, base) {
    const cls = `slot slot-${name}`;
    if (name === 'heading') {
      const h = document.createElement(index === 0 ? 'h1' : 'h2');
      h.className = cls; h.innerHTML = inline(content);
      return [h];
    }
    if (name === 'eyebrow' || name === 'caption') {
      const p = document.createElement('p');
      p.className = cls; p.innerHTML = inline(content);
      return [p];
    }
    if (name === 'media') {
      const fig = document.createElement('figure');
      fig.className = cls; fig.innerHTML = media(content, base);
      return [fig];
    }
    // body, list, left, right, anything else: one element per block
    const tpl = document.createElement('template');
    tpl.innerHTML = blocks(content, base);
    const els = [...tpl.content.children];
    for (const el of els) {
      el.classList.add('slot', `slot-${name}`);
      if (el.matches('ol, ul') && name !== 'list') el.classList.add('slot-list');
    }
    return els;
  }

  function media(s, base) {
    let m;
    if ((m = s.match(/^!\[(.*?)\]\((.+?)\)(?:\{(.*?)\})?\s*$/))) {
      const attrs = parseAttrs(m[3]);
      const style = [attrs.ratio && `--ratio: ${attrs.ratio}`, attrs.focus && `--focus: ${attrs.focus}`].filter(Boolean).join('; ');
      return `<img class="media" src="${esc(resolve(m[2], base))}" alt="${esc(attrs.alt || '')}" style="${esc(style)}">` +
             (m[1] ? `<figcaption>${inline(m[1])}</figcaption>` : '');
    }
    if ((m = s.match(/^\[placeholder(?:\s+([\d./]+))?(?:\s+(.*))?\]\s*(?:\n+([\s\S]*))?$/))) {
      const style = m[1] ? `style="--ratio: ${esc(m[1])}"` : '';
      return `<div class="media-placeholder" ${style}>${esc(m[2] || '')}</div>` +
             (m[3] ? `<figcaption>${inline(m[3].trim())}</figcaption>` : '');
    }
    return blocks(s, base);
  }

  function parseAttrs(s) {
    const out = {};
    if (!s) return out;
    for (const m of s.matchAll(/([\w-]+)=("([^"]*)"|[^\s]+(?:\s+\d+%)?)/g)) out[m[1]] = m[3] ?? m[2];
    return out;
  }

  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[\[(.+?)\]\]/g, '<kbd>$1</kbd>')
      .replace(/\n/g, '<br>');
  }

  function blocks(s, base) {
    const out = [];
    for (const p of s.split(/\n{2,}/)) {
      const t = p.trim();
      if (!t) continue;
      const lines = t.split('\n');
      if (lines.every((l) => /^(-|\*)\s/.test(l))) {
        out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^(-|\*)\s+/, ''))}</li>`).join('')}</ul>`);
      } else if (lines.every((l) => /^\d+\.\s/.test(l))) {
        out.push(`<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ol>`);
      } else if (/^(!\[|\[placeholder)/.test(t)) {
        out.push(`<figure class="slot-media">${media(t, base)}</figure>`);
      } else {
        out.push(`<p>${inline(t)}</p>`);
      }
    }
    return out.join('');
  }

  function resolve(src, base) {
    return /^(https?:)?\//.test(src) || src.startsWith('media/') ? src : base + src;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function loadCss(href) {
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = href;
      link.onload = link.onerror = resolve;
      document.head.appendChild(link);
    });
  }
})();
