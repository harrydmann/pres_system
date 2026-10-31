/* =========================================================
   Web deck — Phase 1
   One piece of state (the active scene index). Scroll and keyboard
   both write to it; chrome and the URL hash read from it.
   ========================================================= */
(() => {
  const scenes = [...document.querySelectorAll('.scene')];
  const sectionEl = document.querySelector('[data-current-section]');
  const progressEl = document.querySelector('[data-progress]');
  const presentBtn = document.querySelector('[data-present-toggle]');
  const gridBtn = document.querySelector('[data-grid-toggle]');
  const gridOverlay = document.querySelector('[data-grid-overlay]');

  let active = 0;

  // ---------- Render ----------
  function render() {
    const scene = scenes[active];
    sectionEl.textContent = scene.dataset.section || '';
    progressEl.style.width = `${((active + 1) / scenes.length) * 100}%`;

    const id = scene.id || String(active);
    if (location.hash !== `#/${id}`) {
      history.replaceState(null, '', `#/${id}`);
    }
  }

  function setActive(i) {
    i = Math.max(0, Math.min(scenes.length - 1, i));
    if (i === active) return;
    active = i;
    render();
  }

  // ---------- Scroll → state ----------
  // The scene under the viewport's horizontal centre line wins. A zero-height
  // root margin band makes this one observer, no ratio bookkeeping, and it
  // stays correct for scenes taller than the viewport.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) setActive(scenes.indexOf(e.target));
    }
  }, { rootMargin: '-50% 0px -50% 0px' });
  scenes.forEach((s) => io.observe(s));

  // ---------- Keyboard → state ----------
  function go(i) {
    i = Math.max(0, Math.min(scenes.length - 1, i));
    // Smooth only between neighbours; longer jumps would sweep the chrome
    // through every scene in between.
    const behavior = Math.abs(i - active) === 1 ? 'smooth' : 'instant';
    scenes[i].scrollIntoView({ block: 'start', behavior });
    // IntersectionObserver will confirm; set eagerly so chrome feels instant.
    setActive(i);
  }

  // Within a tall scene, arrows page through it before leaving it.
  // Returns true if it scrolled.
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

  // ---------- Hash → state (deep links, back/forward) ----------
  function fromHash() {
    const id = location.hash.replace(/^#\/?/, '');
    if (!id) return;
    // Scenes without an id are addressed by index (that's what render() writes).
    const i = /^\d+$/.test(id) ? Number(id) : scenes.findIndex((s) => s.id === id);
    if (i >= 0 && i < scenes.length) {
      scenes[i].scrollIntoView({ block: 'start', behavior: 'instant' });
      setActive(i);
    }
  }
  window.addEventListener('hashchange', fromHash);

  // ---------- Presenting mode ----------
  let idleTimer;
  function togglePresent() {
    const on = document.body.classList.toggle('is-presenting');
    presentBtn.setAttribute('aria-pressed', String(on));
    presentBtn.title = on ? 'Exit (Esc)' : 'Present (F)';
    if (on) {
      document.documentElement.requestFullscreen?.().catch(() => {});
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
    if (!document.fullscreenElement && document.body.classList.contains('is-presenting')) {
      togglePresent();
    }
  });
  presentBtn.addEventListener('click', togglePresent);

  // ---------- Grid overlay (design aid) ----------
  // 12 columns; CSS hides the extras on the narrow grid. Remembered per
  // browser so it survives reloads while designing.
  // Each column is pinned to its own line; auto-placement would start in the edge track.
  gridOverlay.append(...Array.from({ length: 12 }, (_, i) => {
    const col = document.createElement('span');
    col.style.gridColumn = `col ${i + 1}`;
    return col;
  }));
  function toggleGrid(on = gridOverlay.hidden) {
    gridOverlay.hidden = !on;
    gridBtn.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem('deck:grid', on ? '1' : ''); } catch {}
  }
  gridBtn.addEventListener('click', () => toggleGrid());
  try { if (localStorage.getItem('deck:grid')) toggleGrid(true); } catch {}

  // ---------- Baseline centring ----------
  // CSS centring offsets content by (free space ÷ 2), which lands anywhere.
  // Instead, top-align (CSS: .js-centre) and pad by the largest whole number
  // of baselines that keeps the content centred. Body line-height = 1 baseline.
  function centreOnBaseline() {
    const b = parseFloat(getComputedStyle(document.body).lineHeight);
    const fixed = b * 7; // top padding (chrome 2 + 2 clear) + bottom (3)
    for (const s of scenes) {
      if (s.matches('[data-tall], [data-layout="media-full"]')) continue;
      const boxes = [...s.children].map((c) => c.getBoundingClientRect());
      const content = Math.max(...boxes.map((r) => r.bottom)) - Math.min(...boxes.map((r) => r.top));
      const free = Math.max(0, innerHeight - fixed - content);
      s.style.setProperty('--centre', `${Math.floor(free / 2 / b) * b}px`);
    }
  }
  document.documentElement.classList.add('js-centre');
  centreOnBaseline();
  addEventListener('resize', centreOnBaseline);
  document.fonts?.ready.then(centreOnBaseline);

  // ---------- Boot ----------
  // Browser scroll restoration fights snap + hash; do it ourselves.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  fromHash();
  render();
})();
