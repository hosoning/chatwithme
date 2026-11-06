// iOS 27 Liquid Glass：玻璃强度切换（清透 / 默认 / 着色），保存在本机
(function () {
  const KEY = 'ios27Glass';
  const MODES = ['clear', 'default', 'tinted'];
  function read() {
    try { const v = localStorage.getItem(KEY); return MODES.includes(v) ? v : 'default'; } catch (e) { return 'default'; }
  }
  function apply(mode) {
    document.documentElement.dataset.glass = mode;
    document.querySelectorAll('#ios27GlassSegment [data-glass]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.glass === mode);
    });
  }
  function init() {
    apply(read());
    const seg = document.getElementById('ios27GlassSegment');
    if (!seg) return;
    seg.addEventListener('click', e => {
      const btn = e.target.closest('[data-glass]');
      if (!btn) return;
      const mode = btn.dataset.glass;
      try { localStorage.setItem(KEY, mode); } catch (err) {}
      apply(mode);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
