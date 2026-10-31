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
  // The scene covering the most of the viewport wins.
  const ratios = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) ratios.set(e.target, e.intersectionRatio);
    let best = active, bestRatio = -1;
    scenes.forEach((s, i) => {
      const r = ratios.get(s) ?? 0;
      if (r > bestRatio) { bestRatio = r; best = i; }
    });
    setActive(best);
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  scenes.forEach((s) => io.observe(s));

  // ---------- Keyboard → state ----------
  function go(i) {
    i = Math.max(0, Math.min(scenes.length - 1, i));
    scenes[i].scrollIntoView({ block: 'start' });
    // IntersectionObserver will confirm; set eagerly so chrome feels instant.
    setActive(i);
  }

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowDown': case 'ArrowRight': case 'PageDown': case ' ':
        e.preventDefault(); go(active + 1); break;
      case 'ArrowUp': case 'ArrowLeft': case 'PageUp':
        e.preventDefault(); go(active - 1); break;
      case 'Home': e.preventDefault(); go(0); break;
      case 'End':  e.preventDefault(); go(scenes.length - 1); break;
      case 'f': case 'F': togglePresent(); break;
      case 'Escape': if (document.body.classList.contains('is-presenting')) togglePresent(); break;
    }
  });

  // ---------- Hash → state (deep links, back/forward) ----------
  function fromHash() {
    const id = location.hash.replace(/^#\/?/, '');
    if (!id) return;
    const i = scenes.findIndex((s) => s.id === id);
    if (i >= 0) {
      scenes[i].scrollIntoView({ block: 'start', behavior: 'instant' });
      setActive(i);
    }
  }
  window.addEventListener('hashchange', fromHash);

  // ---------- Presenting mode ----------
  let idleTimer;
  function togglePresent() {
    const on = document.body.classList.toggle('is-presenting');
    presentBtn.textContent = on ? 'Exit' : 'Present';
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

  // ---------- Boot ----------
  // Browser scroll restoration fights snap + hash; do it ourselves.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  fromHash();
  render();
})();
