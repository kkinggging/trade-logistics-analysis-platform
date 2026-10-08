(() => {
  const root = document.getElementById('shougang-ai-embed');
  if (!root) return;

  const panel = document.getElementById('shougang-ai-panel');
  const toggle = root.querySelector('.shougang-ai-embed__toggle');
  const close = root.querySelector('.shougang-ai-embed__close');
  if (!panel || !toggle || !close) return;

  const setOpen = (open) => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '收起首钢大模型' : '打开首钢大模型');
    if (open) close.focus();
    else toggle.focus();
  };

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) setOpen(false);
  });
})();
