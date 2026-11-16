/* ==========================================================================
   AuraAccess: view router (js/router.js)
   ---------------------------------------------------------------------------
   Four views live in one page, only one visible at a time:

       #view-home   #view-opportunities   #view-places   #view-settings

   Each is a role="tabpanel" controlled by a role="tab" button in the header
   tablist ([data-view]). Nothing is fetched and nothing reloads.

   WHAT HAPPENS WHEN THE VIEW CHANGES
     1. the old panel gets [hidden], the new one loses it and gets .view-active
     2. aria-selected and the roving tabindex follow the new tab
     3. the URL becomes #/opportunities (Back/Forward and deep links work)
     4. document.title names the view
     5. focus moves to the view's <h1> (tabindex="-1"), scrolled to the top
     6. a polite live region (#view-status) says where you are
     7. speech is stopped and "aura:viewchange" is dispatched on document
        (js/placemap.js listens: the Google map loads the first time its view is shown)

   TABLIST KEYBOARD (WAI-ARIA tabs pattern, MANUAL activation)
     Left / Right   previous / next tab (mirrored automatically in RTL)
     Up / Down      previous / next tab (the mobile menu is a column)
     Home / End     first / last tab
     Enter / Space  open the focused tab
   Manual activation on purpose: opening a view moves focus into it, so
   activating on every arrow press would pull focus away from the tablist
   before the next arrow press.

   LINKS INSIDE THE PAGE
     <a href="#/opportunities" data-route="opportunities" data-preset="category:course">
         opens the view (and presses that chip in #opp-filter)
     <a href="#id" data-scroll="id">   scrolls to and focuses an element

   First load: no focus theft and no announcement; the view comes from the URL
   (#/places) and unknown or empty hashes mean the home view.
   Loaded as a blocking script at the end of <body> so the right view is shown
   before the first paint. If the markup is incomplete, every view stays visible.
   ========================================================================== */
(function () {
  'use strict';

  const VIEWS = Object.freeze(['home', 'opportunities', 'places', 'settings']);
  const DEFAULT_VIEW = 'home';
  const SITE = 'آورا أكسس';
  // Old in-page anchors keep working as deep links
  const LEGACY = Object.freeze({ services: 'opportunities', directory: 'places', support: 'home', contact: 'home', highlights: 'home', mission: 'home' });

  const T = Object.freeze({
    arrived: (label) => `تم الانتقال إلى صفحة ${label}`,
  });

  const root = document.documentElement;
  const tablist = document.querySelector('[role="tablist"][data-tabs]');
  const tabs = tablist ? Array.from(tablist.querySelectorAll('[role="tab"][data-view]')) : [];
  const panels = new Map();
  VIEWS.forEach((id) => {
    const panel = document.getElementById(`view-${id}`);
    if (panel) panels.set(id, panel);
  });

  // Incomplete markup: do nothing, so the whole page stays visible and usable
  if (!tablist || tabs.length !== VIEWS.length || panels.size !== VIEWS.length ||
      !tabs.every((tab) => panels.has(tab.dataset.view))) {
    console.warn('[AuraRouter] views or tabs missing: all views stay visible.');
    return;
  }

  const homeTitle = document.title;
  let current = null;
  let fillTimer = 0;
  let clearTimer = 0;

  /* ---------- helpers ---------- */
  const labelOf = (view) => panels.get(view).dataset.viewTitle || view;

  const parse = (hash) => {
    let raw = String(hash || '').replace(/^#\/?/, '');
    try { raw = decodeURIComponent(raw); } catch (error) { return null; }
    const name = raw.trim().toLowerCase().split(/[/?]/)[0];
    if (VIEWS.includes(name)) return name;
    return LEGACY[name] || null;
  };

  /** Empty hash = home; an unknown hash (an ordinary in-page anchor) = leave the view alone. */
  const viewFromLocation = () => {
    const hash = window.location.hash;
    if (!hash || hash === '#') return DEFAULT_VIEW;
    return parse(hash);
  };

  const headingOf = (view) => {
    const heading = panels.get(view).querySelector('h1');
    if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    return heading;
  };

  /* ---------- screen-reader status ---------- */
  const statusRegion = () => {
    let region = document.getElementById('view-status');
    if (!region) {
      region = document.createElement('p');
      region.id = 'view-status';
      region.className = 'visually-hidden';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      document.body.append(region);
    }
    return region;
  };

  const say = (message) => {
    const region = statusRegion();
    window.clearTimeout(fillTimer);
    window.clearTimeout(clearTimer);
    region.textContent = '';                       // clear first: the same sentence twice is still announced
    fillTimer = window.setTimeout(() => {
      region.textContent = message;
      clearTimer = window.setTimeout(() => { region.textContent = ''; }, 8000);
    }, 60);
  };

  /* ---------- history ---------- */
  const writeHash = (view) => {
    const target = `#/${view}`;
    if (window.location.hash === target) return;
    try {
      window.history.pushState({ view }, '', target);
    } catch (error) {
      window.location.hash = target;               // e.g. sandboxed frames; hashchange then finds nothing to do
    }
  };

  /* ---------- filters preset: "category:course" presses that chip ---------- */
  const applyPreset = (preset) => {
    const [group, value] = String(preset || '').split(':');
    if (!group || !value) return;
    const form = document.getElementById('opp-filter');
    if (!form) return;
    const chips = Array.from(form.querySelectorAll('button[data-filter-group]'))
      .filter((chip) => chip.dataset.filterGroup === group);
    const chip = chips.find((item) => item.dataset.filterValue === value);
    // Pressing an active chip again would switch it back to "All", so only press inactive ones
    if (chip && chip.getAttribute('aria-pressed') !== 'true') chip.click();
  };

  /* ---------- the switch ---------- */
  const show = (view, options) => {
    if (!panels.has(view)) return false;
    const opts = Object.assign({ focus: true, announce: true, history: true, preset: null }, options);
    const previous = current;
    const changed = view !== previous;

    if (changed) {
      panels.forEach((panel, id) => {
        const active = id === view;
        panel.hidden = !active;
        panel.classList.toggle('view-active', active);
      });
      tabs.forEach((tab) => {
        const active = tab.dataset.view === view;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      current = view;
      root.dataset.view = view;
      document.title = view === DEFAULT_VIEW ? homeTitle : `${labelOf(view)} | ${SITE}`;
      if (opts.history) writeHash(view);
      if (window.AuraAccess && typeof window.AuraAccess.stopSpeaking === 'function') window.AuraAccess.stopSpeaking();
    }

    if (opts.preset) applyPreset(opts.preset);

    if (opts.focus) {
      // Instant on purpose: a smooth scroll back up from a long view would look like erratic page jumping
      try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch (error) { window.scrollTo(0, 0); }
      const heading = headingOf(view);
      if (heading) heading.focus({ preventScroll: true });
    }
    if (changed && opts.announce) say(T.arrived(labelOf(view)));

    if (changed) {
      document.dispatchEvent(new CustomEvent('aura:viewchange', { detail: { view, previous, initial: previous === null } }));
    }
    return true;
  };

  /* ---------- events ---------- */
  const onTabKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    const tab = event.target.closest ? event.target.closest('[role="tab"]') : null;
    const index = tab ? tabs.indexOf(tab) : -1;
    if (index === -1) return;

    const rtl = window.getComputedStyle(tablist).direction === 'rtl';
    let target;
    switch (event.key) {
      case 'ArrowRight': target = rtl ? index - 1 : index + 1; break;
      case 'ArrowLeft': target = rtl ? index + 1 : index - 1; break;
      case 'ArrowDown': target = index + 1; break;
      case 'ArrowUp': target = index - 1; break;
      case 'Home': target = 0; break;
      case 'End': target = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();                         // no page scrolling while moving through the tabs
    tabs[(target + tabs.length) % tabs.length].focus();
  };

  const isPlainClick = (event) =>
    !event.defaultPrevented && event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);

  const onClick = (event) => {
    if (!isPlainClick(event) || !event.target.closest) return;

    const tab = event.target.closest('[role="tab"][data-view]');
    if (tab && tablist.contains(tab)) {
      event.preventDefault();
      show(tab.dataset.view);
      return;
    }

    const route = event.target.closest('[data-route]');
    if (route && panels.has(route.dataset.route)) {
      event.preventDefault();
      show(route.dataset.route, { preset: route.dataset.preset });
      return;
    }

    const scroller = event.target.closest('[data-scroll]');
    if (scroller) {
      const target = document.getElementById(scroller.dataset.scroll);
      if (!target) return;
      event.preventDefault();
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.scrollIntoView({ block: 'start' });
      target.focus({ preventScroll: true });
    }
  };

  const onLocationChange = () => {
    const view = viewFromLocation();
    if (view && view !== current) show(view, { history: false });
  };

  /* ---------- sticky header height (for scroll-padding, so focus is never hidden behind it) ---------- */
  const trackChrome = () => {
    const chrome = document.getElementById('top-chrome');
    if (!chrome || !('ResizeObserver' in window)) return;
    const dock = document.getElementById('main-nav');
    const measure = () => {
      root.style.setProperty('--chrome-h', `${chrome.offsetHeight}px`);
      // Below 64rem the tab bar is fixed to the bottom edge (css/app-shell.css): reserve its height
      const docked = dock && window.getComputedStyle(dock).position === 'fixed';
      root.style.setProperty('--dock-h', docked ? `${dock.offsetHeight}px` : '0px');
    };
    const observer = new window.ResizeObserver(measure);
    observer.observe(chrome);
    if (dock) observer.observe(dock);
    measure();
  };

  /* ---------- start ---------- */
  tablist.addEventListener('keydown', onTabKeyDown);
  document.addEventListener('click', onClick);
  window.addEventListener('popstate', onLocationChange);
  window.addEventListener('hashchange', onLocationChange);

  root.classList.add('js-router');
  show(viewFromLocation() || DEFAULT_VIEW, { focus: false, announce: false, history: false });
  trackChrome();

  window.AuraRouter = Object.freeze({
    version: '1.0.0',
    views: VIEWS,
    current: () => current,
    show: (view, options) => show(view, options),
    _internals: Object.freeze({ parse }),
  });
})();
