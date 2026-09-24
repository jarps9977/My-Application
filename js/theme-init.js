// Apply the saved theme before first paint; js/app.js keeps it in sync.
// Kept as an external file so the CSP in index.html needs no 'unsafe-inline' for scripts.
(function () {
  try {
    var t = localStorage.getItem('toolbox.theme');
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) { /* storage unavailable */ }
})();
