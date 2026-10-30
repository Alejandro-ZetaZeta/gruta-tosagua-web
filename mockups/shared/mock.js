// Interacciones de maqueta (solo visual, sin backend).
for (const w of document.querySelectorAll('[data-wizard]')) {
  const steps = [...w.querySelectorAll('[data-step]')];
  const marks = [...document.querySelectorAll('[data-progress] > li')];
  let i = 0;
  const show = (n, focus = true) => {
    i = Math.max(0, Math.min(steps.length - 1, n));
    steps.forEach((s, k) => (s.hidden = k !== i));
    marks.forEach((m, k) => {
      m.classList.toggle('done', k < i);
      k === i ? m.setAttribute('aria-current', 'step') : m.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-step-label]').forEach((l) => (l.textContent = `Paso ${i + 1} de ${steps.length}`));
    document.querySelectorAll('[data-bar]').forEach((b) => (b.style.width = `${((i + 1) / steps.length) * 100}%`));
    document.body.dataset.step = i + 1;
    if (focus) {
      steps[i].querySelector('[tabindex="-1"]')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-next],[data-prev],[data-goto]');
    if (!b) return;
    e.preventDefault();
    if (b.hasAttribute('data-next')) show(i + 1);
    else if (b.hasAttribute('data-prev')) show(i - 1);
    else show(Number(b.dataset.goto));
  });
  show(0, false);
}

for (const c of document.querySelectorAll('[data-counter]')) {
  const out = c.querySelector('output');
  let n = Number(out.textContent) || 3;
  const render = () => {
    out.textContent = n;
    document.querySelectorAll('[data-total]').forEach((t) => (t.textContent = `$${n}.00`));
    document.querySelectorAll('[data-emis]').forEach((t) => (t.textContent = n === 1 ? '1 vez' : `${n} veces`));
  };
  c.addEventListener('click', (e) => {
    const b = e.target.closest('[data-delta]');
    if (!b) return;
    n = Math.max(1, Math.min(12, n + Number(b.dataset.delta)));
    render();
  });
  render();
}

for (const p of document.querySelectorAll('[data-pause]')) {
  const sync = () => document.body.classList.toggle('paused', p.checked);
  p.addEventListener('change', sync);
  sync();
}

for (const b of document.querySelectorAll('[data-copy]')) {
  b.addEventListener('click', () => {
    navigator.clipboard?.writeText(b.dataset.copy);
    const old = b.innerHTML;
    b.textContent = '¡Copiado!';
    setTimeout(() => (b.innerHTML = old), 1500);
  });
}

