/* ==========================================================================
   AuraAccess: js/boot.js
   Runs in the <head>, BEFORE the page is painted (no "defer", about 20 lines).

   Why it exists: app.js is deferred, so it runs after the first paint. A visitor
   who chose the dark theme on a light-theme computer would see a white flash
   on every page load. This file reads the same saved preference and sets
   <html data-theme> immediately, so the first paint already has the right colours.

   It only reads. All saving, toggling and announcing stays in app.js.
   If storage is blocked or the value is bad, it does nothing and the CSS
   follows the operating system (prefers-color-scheme).
   ========================================================================== */
(function () {
  'use strict';
  try {
    var raw = window.localStorage.getItem('auraaccess.prefs.v1');   // same key as CONFIG.storageKey in app.js
    if (!raw) return;
    var prefs = JSON.parse(raw);
    if (prefs && (prefs.theme === 'dark' || prefs.theme === 'light')) {
      document.documentElement.setAttribute('data-theme', prefs.theme);
    }
  } catch (error) { /* blocked or corrupt storage: follow the OS */ }
})();
