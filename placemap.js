/* ==========================================================================
   AuraAccess: places list <-> embedded Google map (js/placemap.js)  v2.0.0
   ---------------------------------------------------------------------------
   One map technology only: an embedded Google Maps iframe. There are no map
   tiles and no map library, so nothing here can be blocked by a tile policy
   (the old OpenStreetMap tiles answered 403 to pages opened from file://,
   because they send no Referer).

   FLOW
     click "اعرض على الخريطة" (or the card itself) -> select(id)
       - the card gets .is-selected + aria-current + a visible text flag
       - the "selected place" panel is filled (the text alternative to the map)
       - the iframe loads the embed URL of that place's address string
     nothing selected -> the map shows Egypt as a whole (loaded the first time
     the Places view is shown, never while another view is open)
     the card's "اتجاهات عبر خرائط جوجل" button (js/catalog.js) is a separate,
     redundant way in: it opens Google Maps directions in a new tab

   ACCESSIBILITY
     - the iframe has a title naming the place; loading and failure are written
       text in a role="status" region; a retry button and external links exist
     - the card itself is only a mouse convenience; keyboard users use the button
     - every fact on the map is also in the list, the selected-place panel and
       the "text description of the map" (<details>)
     - text from the page is only inserted with textContent
   ========================================================================== */
(() => {
  'use strict';

  const CONFIG = Object.freeze({
    embed: Object.freeze({
      // Keyless embed form. With a Maps Embed API key (restricted to your domain) put it here and the
      // official /maps/embed/v1/place endpoint is used instead. Note: such a key cannot be restricted
      // to file:// pages, so for a local demo the keyless form is the right one.
      apiKey: '',
      language: 'ar',
      zoom: 15,
      overview: Object.freeze({ query: 'Egypt', zoom: 6, label: 'مصر' }),
      loadTimeoutMs: 12000,
      maxQuery: 200,
    }),
  });

  const T = Object.freeze({
    show: 'اعرض على الخريطة',
    flag: 'معروض على الخريطة',
    type: { public: 'مكان عام', medical: 'مركز أو خدمة', school: 'مدرسة' },
    cities: { cairo: 'القاهرة', giza: 'الجيزة', alexandria: 'الإسكندرية' },
    otherCity: 'مدن أخرى',
    iframeTitle: (name) => `خريطة جوجل: ${name}`,
    failed: 'تعذّر تحميل خرائط جوجل. تحقق من الإنترنت ثم أعد المحاولة، أو استخدم زر الاتجاهات الذي يفتح جوجل في نافذة جديدة.',
    offline: 'لا يوجد اتصال بالإنترنت الآن، لذلك لا يمكن عرض خرائط جوجل. قائمة الأماكن وأزرار الاتجاهات تعمل كالمعتاد.',
    selecting: (name) => `جارٍ عرض ${name} على خرائط جوجل`,
    loaded: (name) => `تم عرض ${name} على خرائط جوجل داخل الصفحة`,
    overviewLoaded: 'تم عرض خريطة مصر',
    cleared: 'تم إخفاء المكان المعروض لأنه لم يعد ضمن نتائج التصفية.',
    textSummary: (total) => (total === 0
      ? 'لا توجد أماكن ضمن التصفية الحالية.'
      : `الخريطة تغطي ${total} ${total === 1 ? 'مكانًا' : 'أماكن'}. اختر أي مكان من القائمة لعرضه.`),
  });

  const $ = (id) => document.getElementById(id);
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- pure helpers (exported for tests) ---------- */
  const isGoogleUrl = (url) => {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && (u.hostname === 'www.google.com' || u.hostname === 'maps.google.com');
    } catch (error) { return false; }
  };

  /** Embed URL for a search query, or '' when the query is empty. */
  const embedUrl = (query, options) => {
    const cfg = Object.assign({}, CONFIG.embed, options);
    const q = String(query == null ? '' : query).replace(/\s+/g, ' ').trim().slice(0, cfg.maxQuery);
    if (!q) return '';
    const enc = encodeURIComponent(q);
    const url = cfg.apiKey
      ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(cfg.apiKey)}&q=${enc}&language=${cfg.language}&zoom=${cfg.zoom}`
      : `https://www.google.com/maps?q=${enc}&hl=${cfg.language}&z=${cfg.zoom}&output=embed`;
    return isGoogleUrl(url) ? url : '';
  };

  const directionsUrl = (query) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(query || '').trim())}`;
  const searchUrl = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(query || '').trim())}`;

  /* ---------- state ---------- */
  const state = { started: false, places: [], byId: new Map(), selected: null, loadedKey: null, loadTimer: 0, sayFill: 0, sayClear: 0 };
  const ui = {};

  const say = (message) => {
    if (!ui.live) return;
    window.clearTimeout(state.sayFill);
    window.clearTimeout(state.sayClear);
    ui.live.textContent = '';
    state.sayFill = window.setTimeout(() => {
      ui.live.textContent = message;
      state.sayClear = window.setTimeout(() => { ui.live.textContent = ''; }, 8000);
    }, 60);
  };

  /* ---------- read the list (the single source of truth) ---------- */
  const isShown = (li) => {
    const hidden = li.closest('[hidden]');
    return !hidden || hidden.classList.contains('view');
  };

  const readPlaces = (listEl) => Array.from(listEl.querySelectorAll(':scope > .place-list__item')).map((li, index) => {
    const titleEl = li.querySelector('.place__title');
    const name = titleEl ? titleEl.textContent.trim() : `مكان ${index + 1}`;
    const metaEl = li.querySelector('.place__meta');
    const badge = li.querySelector('.badge');
    let statusLabel = '';
    if (badge) {
      const copy = badge.cloneNode(true);
      copy.querySelectorAll('.visually-hidden').forEach((node) => node.remove());
      statusLabel = copy.textContent.trim();
    }
    return {
      id: li.id || `place-${index + 1}`,
      li,
      article: li.querySelector('.place'),
      name,
      meta: metaEl ? metaEl.textContent.trim() : '',
      type: T.type[li.dataset.placeType] ? li.dataset.placeType : 'public',
      cities: (li.dataset.city || '').split(/\s+/).filter(Boolean),
      statusLabel,
      query: (li.dataset.mapQuery || name).trim(),
      flag: null,
    };
  });

  /* ---------- selection marks and panel ---------- */
  const markSelected = (place) => {
    state.places.forEach((p) => {
      const on = p === place;
      p.li.classList.toggle('is-selected', on);
      if (p.article) {
        if (on) p.article.setAttribute('aria-current', 'true'); else p.article.removeAttribute('aria-current');
      }
      if (p.flag) p.flag.hidden = !on;
    });
  };

  const setText = (el, text) => { if (el) el.textContent = text; };

  const renderPanel = (place) => {
    if (!ui.msBody || !ui.msEmpty) return;
    ui.msEmpty.hidden = !!place;
    ui.msBody.hidden = !place;
    if (!place) return;
    setText(ui.msName, place.name);
    setText(ui.msWhere, `${T.type[place.type]}${place.meta ? ` · ${place.meta}` : ''}`);
    setText(ui.msStatus, place.statusLabel || '—');
    setText(ui.msQuery, place.query);
    if (ui.msDirections) ui.msDirections.href = directionsUrl(place.query);
    if (ui.msExternal) ui.msExternal.href = searchUrl(place.query);
  };

  /* ---------- the iframe ---------- */
  const showOnly = (which) => {                       // 'loading' | 'error' | 'frame'
    if (ui.loading) ui.loading.hidden = which !== 'loading';
    if (ui.error) ui.error.hidden = which !== 'error';
    ui.iframe.hidden = which === 'error';
    ui.frame.setAttribute('aria-busy', which === 'loading' ? 'true' : 'false');
  };

  const fail = (message) => {
    window.clearTimeout(state.loadTimer);
    state.loadedKey = null;
    setText(ui.errorText, message);
    showOnly('error');
    say(message);
  };

  /** Show a place (or the overview of Egypt when place is null). `force` reloads the same target. */
  const render = (place, { force = false, announce = true } = {}) => {
    const key = place ? place.id : '__overview__';
    if (!force && state.loadedKey === key && ui.iframe.getAttribute('src')) { showOnly('frame'); return; }
    if (window.navigator && window.navigator.onLine === false) { fail(T.offline); return; }
    const url = place ? embedUrl(place.query) : embedUrl(CONFIG.embed.overview.query, { zoom: CONFIG.embed.overview.zoom });
    if (!url) { fail(T.failed); return; }

    window.clearTimeout(state.loadTimer);
    showOnly('loading');
    ui.iframe.title = T.iframeTitle(place ? place.name : CONFIG.embed.overview.label);
    ui.iframe.onload = () => {
      window.clearTimeout(state.loadTimer);
      const current = state.selected ? state.selected.id : '__overview__';
      if (current !== key) return;                    // the choice changed while loading
      showOnly('frame');
      if (announce) say(place ? T.loaded(place.name) : T.overviewLoaded);
    };
    state.loadTimer = window.setTimeout(() => fail(T.failed), CONFIG.embed.loadTimeoutMs);
    state.loadedKey = key;
    ui.iframe.src = url;
  };

  const scrollToMap = () => {
    if (ui.stack && ui.stack.scrollIntoView) ui.stack.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  /* ---------- select / clear ---------- */
  const select = (id, { scroll = true } = {}) => {
    const place = state.byId.get(id);
    if (!place) return false;
    state.selected = place;
    markSelected(place);
    renderPanel(place);
    say(T.selecting(place.name));
    render(place);
    if (scroll) scrollToMap();
    return true;
  };

  const clearSelection = (announce) => {
    if (!state.selected) return;
    state.selected = null;
    markSelected(null);
    renderPanel(null);
    render(null, { announce: false });
    if (announce) say(T.cleared);
  };

  /* ---------- text alternative for the whole map ---------- */
  const renderText = () => {
    if (!ui.textBody) return;
    const shown = state.places.filter((p) => isShown(p.li));
    const groups = new Map();
    shown.forEach((p) => {
      const known = p.cities.filter((c) => T.cities[c]);
      const key = known.length === 1 ? T.cities[known[0]] : T.otherCity;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });
    const summary = document.createElement('p');
    summary.textContent = T.textSummary(shown.length);
    const nodes = [summary];
    if (shown.length) {
      const outer = document.createElement('ul');
      outer.className = 'map-text__cities';
      groups.forEach((items, city) => {
        const li = document.createElement('li');
        const strong = document.createElement('strong');
        strong.textContent = `${city} (${items.length})`;
        const inner = document.createElement('ul');
        items.forEach((p) => {
          const item = document.createElement('li');
          item.textContent = `${p.name}. ${p.meta ? `${p.meta}. ` : ''}${p.statusLabel ? `${p.statusLabel}.` : ''}`;
          inner.append(item);
        });
        li.append(strong, inner);
        outer.append(li);
      });
      nodes.push(outer);
    }
    ui.textBody.replaceChildren(...nodes);
  };

  /* ---------- cards ---------- */
  const decorateCards = () => {
    state.places.forEach((p) => {
      if (!p.article) return;
      if (!p.article.querySelector('[data-place-select]')) {
        let actions = p.article.querySelector('.place__links');
        if (!actions) { actions = document.createElement('div'); actions.className = 'place__links'; p.article.append(actions); }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn--secondary';
        button.dataset.placeSelect = p.id;
        button.append(T.show);
        const hiddenName = document.createElement('span');
        hiddenName.className = 'visually-hidden';
        hiddenName.textContent = `: ${p.name}`;
        button.append(hiddenName);
        actions.prepend(button);
      }
      const header = p.article.querySelector('.place__header');
      if (header) {
        p.flag = header.querySelector('.place__flag');
        if (!p.flag) {
          p.flag = document.createElement('span');
          p.flag.className = 'place__flag';
          p.flag.textContent = T.flag;
          p.flag.hidden = true;
          header.append(p.flag);
        }
      }
    });
  };

  /* ---------- wiring ---------- */
  const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"]';

  const onClick = (event) => {
    const target = event.target;
    if (!target || !target.closest) return;
    const button = target.closest('[data-place-select]');
    if (button) { select(button.dataset.placeSelect); return; }
    if (target.closest('#gmap-retry')) { render(state.selected, { force: true }); return; }
    // Mouse convenience: the empty part of a card selects it. Keyboard users have the button.
    if (event.button !== 0 || target.closest(INTERACTIVE)) return;
    const li = target.closest('.place-list__item');
    if (li && ui.list && ui.list.contains(li) && state.byId.has(li.id)) select(li.id);
  };

  const observeList = () => {
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        if (state.selected && !isShown(state.selected.li)) clearSelection(true);
        // Filtering down to exactly one place: the map follows, without moving the page
        const visible = state.places.filter((p) => isShown(p.li));
        if (visible.length === 1 && (!state.selected || state.selected.id !== visible[0].id)) {
          select(visible[0].id, { scroll: false });
        }
        renderText();
      });
    }).observe(ui.list, { attributes: true, attributeFilter: ['hidden'], subtree: true });
  };

  /** The overview loads the first time the Places view is on screen (never while the person is on another view). */
  const onPlacesVisible = () => {
    if (!state.loadedKey && !state.selected) render(null, { announce: false });
  };

  const init = () => {
    if (state.started) return;
    ui.list = $('directory-list');
    ui.stack = $('map-stack');
    ui.frame = $('gmap-frame');
    ui.iframe = $('gmap-iframe');
    ui.loading = $('gmap-loading');
    ui.error = $('gmap-error');
    ui.errorText = $('gmap-error-text');
    ui.live = $('map-live');
    ui.msEmpty = $('ms-empty');
    ui.msBody = $('ms-body');
    ui.msName = $('ms-name');
    ui.msWhere = $('ms-where');
    ui.msStatus = $('ms-status');
    ui.msQuery = $('ms-query');
    ui.msDirections = $('ms-directions');
    ui.msExternal = $('ms-external');
    ui.textBody = $('map-text-body');
    if (!ui.list || !ui.stack || !ui.frame || !ui.iframe) return;     // markup incomplete: the list and its links still work

    state.places = readPlaces(ui.list);
    state.places.forEach((p) => state.byId.set(p.id, p));
    if (!state.places.length) return;

    decorateCards();
    renderPanel(null);
    renderText();
    document.documentElement.dataset.mapReady = 'true';

    document.addEventListener('click', onClick);
    document.addEventListener('aura:viewchange', (event) => { if (event.detail && event.detail.view === 'places') onPlacesVisible(); });
    observeList();
    state.started = true;
    if (document.documentElement.dataset.view === 'places') onPlacesVisible();
  };

  window.AuraPlaceMap = Object.freeze({
    version: '2.0.0',
    select: (id) => select(id),
    clear: () => clearSelection(false),
    selected: () => (state.selected ? state.selected.id : null),
    /** Rebuild from the list (catalog.js calls this if it rendered after us). */
    refresh: () => {
      if (!state.started) { init(); return; }
      state.places = readPlaces(ui.list);
      state.byId.clear();
      state.places.forEach((p) => state.byId.set(p.id, p));
      decorateCards();
      renderText();
    },
    _internals: Object.freeze({ embedUrl, directionsUrl, searchUrl, isGoogleUrl }),
  });

  // Deferred scripts run in order before DOMContentLoaded; "interactive" alone cannot tell us it is over
  const domReady = () => {
    if (document.readyState === 'complete') return true;
    if (document.readyState !== 'interactive') return false;
    try {
      const nav = window.performance.getEntriesByType('navigation')[0];
      return !!nav && nav.domContentLoadedEventEnd > 0;
    } catch (error) { return false; }
  };
  if (domReady()) init();
  else {
    document.addEventListener('DOMContentLoaded', init, { once: true });
    window.addEventListener('load', init, { once: true });
  }
})();
