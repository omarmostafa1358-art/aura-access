/* ==========================================================================
   AuraAccess: app shell (js/shell.js)
   ---------------------------------------------------------------------------
   Below 64rem the accessibility toolbar folds behind one button
   (#a11y-toggle -> #a11y-tools) so the top of the screen stays compact.
   The preferences themselves are untouched: they apply and persist as before.

     - the button reports aria-expanded; the open toolbar is a panel under the bar
     - Escape closes it and returns focus to the button
     - changing view, or growing to desktop width, closes it
     - without this script the toolbar simply stays visible (the CSS only
       collapses it once <html> has the "js-shell" class, added at the end)
   Loaded as a blocking script at the end of <body>, next to js/router.js.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var toggle = document.getElementById('a11y-toggle');
  var tools = document.getElementById('a11y-tools');
  if (!toggle || !tools) { return; }                         // markup missing: toolbar stays visible

  var DESKTOP = '(min-width: 64rem)';                        // keep in sync with css/app-shell.css

  function isOpen() { return toggle.getAttribute('aria-expanded') === 'true'; }
  function setOpen(open) { toggle.setAttribute('aria-expanded', String(open)); }
  function collapsible() { return window.getComputedStyle(toggle).display !== 'none'; }

  toggle.addEventListener('click', function () { setOpen(!isOpen()); });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) { return; }
    if (!isOpen() || !collapsible()) { return; }
    var inside = tools.contains(document.activeElement) || document.activeElement === toggle;
    setOpen(false);
    if (inside) { toggle.focus(); }
  });

  document.addEventListener('aura:viewchange', function () { setOpen(false); });

  if (typeof window.matchMedia === 'function') {
    var query = window.matchMedia(DESKTOP);
    var onChange = function (event) { if (event.matches) { setOpen(false); } };
    if (typeof query.addEventListener === 'function') { query.addEventListener('change', onChange); }
    else if (typeof query.addListener === 'function') { query.addListener(onChange); }
  }

  setOpen(false);
  root.classList.add('js-shell');                            // last: turns the collapsing CSS on
  window.AuraShell = Object.freeze({ version: '1.0.0', open: function () { setOpen(true); }, close: function () { setOpen(false); }, isOpen: isOpen });
})();
