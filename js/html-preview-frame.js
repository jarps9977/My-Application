(function () {
  'use strict';

  var frame = document.getElementById('htmlpv-inner');
  window.addEventListener('message', function (e) {
    // Only the embedding app view may push code; the inner frame stays sandboxed either way.
    if (e.source !== window.parent || window.parent === window || typeof e.data !== 'string') return;
    frame.srcdoc = e.data;
  });
})();
