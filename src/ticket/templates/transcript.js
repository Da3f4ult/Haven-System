(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var pad = function (n) { return String(n).padStart(2, '0'); };

  // UTC <-> local time toggle
  var local = false;
  var toggle = $('#tz-toggle');
  function render() {
    $$('time[data-ts]').forEach(function (t) {
      var d = new Date(Number(t.getAttribute('data-ts')));
      t.textContent = local
        ? d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
        : t.getAttribute('data-utc');
    });
    if (toggle) toggle.textContent = local ? 'Show UTC' : 'Show local time';
  }
  if (toggle) toggle.addEventListener('click', function () { local = !local; render(); });

  // Search
  var search = $('#search');
  if (search) {
    search.addEventListener('input', function () {
      var q = search.value.trim().toLowerCase();
      $$('#messages .msg').forEach(function (el) {
        el.classList.toggle('hidden', q !== '' && el.textContent.toLowerCase().indexOf(q) === -1);
      });
    });
  }

  // Spoilers
  document.addEventListener('click', function (e) {
    var s = e.target.closest && e.target.closest('.spoiler');
    if (s) s.classList.toggle('shown');
  });

  // Expired / missing attachment images degrade gracefully
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('att-img')) {
      var box = document.createElement('div');
      box.className = 'att-gone';
      box.textContent = 'Image no longer available: ' + (t.getAttribute('alt') || 'attachment');
      if (t.parentNode) t.parentNode.replaceChild(box, t);
    }
  }, true);
})();
