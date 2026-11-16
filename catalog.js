/* ==========================================================================
   AuraAccess: catalog renderer (js/catalog.js)
   ---------------------------------------------------------------------------
   Turns window.AuraData (js/data.js) into the cards of two existing lists:
     #opp-list         courses and assistive tools   (.opp-grid__item)
     #directory-list   places                        (.place-list__item)

   It writes the data-* attributes the existing filter engine in app.js and the
   map in map.js already read, so no other module needs to know about the data:
     data-category   course | tool
     data-place-type public | medical
     data-status     open | partial | unknown
     data-access     tokens: mobility visual hearing cognitive
     data-city       tokens: cairo giza alexandria  (or "all")
     data-map-query  the place address string used for the embedded map and the directions link

   Load order (all deferred): data.js, catalog.js, app.js, placemap.js.
   This script must run BEFORE app.js (filters read the list on start) and
   map.js (pins are built from the list on start).

   Security: cards are built with createElement/textContent, never innerHTML,
   and external links must be https:.
   ========================================================================== */
(function () {
  'use strict';

  const data = window.AuraData;
  const oppList = document.getElementById('opp-list');
  const placeList = document.getElementById('directory-list');

  if (!data) {
    console.error('[AuraCatalog] window.AuraData is missing: load js/data.js first.');
    return;
  }

  /* ---------- constants ---------- */
  const ACCESS_IDS = data.access.map((a) => a.id);
  const CITY_IDS = data.cities.map((c) => c.id);
  const LABEL = Object.freeze({
    access: Object.fromEntries(data.access.map((a) => [a.id, a.label])),
    city: Object.fromEntries(data.cities.map((c) => [c.id, c.label])),
  });
  const T = Object.freeze({
    course: 'دورة',
    tool: 'أداة مساعدة',
    allAccess: 'كل فئات الإعاقة',
    allCities: 'المدينة غير محددة أو عبر الإنترنت',
    confirmed: 'تم التحقق من المصدر',
    partial: 'تحقق جزئي',
    sourceLabel: 'المصدر:',
    checkedOn: 'روجع في',
    newWindow: ' (يفتح في نافذة جديدة)',
    directions: 'اتجاهات عبر خرائط جوجل',
    requestVisit: 'اطلب زيارة أو مساعدة',
    requestCourse: 'اطلب التسجيل أو المعلومات',
    requestTool: 'اطلب هذه الأداة',
  });

  /* ---------- helpers ---------- */
  const h = (tag, attrs, ...children) => {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'text') el.textContent = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    });
    children.flat().forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      el.append(child.nodeType ? child : document.createTextNode(String(child)));
    });
    return el;
  };

  const isHttps = (value) => {
    try { return new URL(value).protocol === 'https:'; } catch (error) { return false; }
  };

  /** Google Maps search link: https://developers.google.com/maps/documentation/urls/get-started#search-action */
  const mapsUrl = (locationName) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationName)}`;

  /**
   * Google Maps directions link. No origin on purpose: Google Maps then starts from the device's own
   * location (and asks for permission itself). https://developers.google.com/maps/documentation/urls/get-started#directions-action
   */
  const directionsUrl = (destination) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(destination || '').trim())}`;

  /** Decorative map pin (aria-hidden); colour follows the button text via currentColor. */
  const pinIcon = () => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    [['viewBox', '0 0 24 24'], ['width', '20'], ['height', '20'], ['aria-hidden', 'true'], ['focusable', 'false'], ['class', 'btn__icon']]
      .forEach(([k, v]) => svg.setAttribute(k, v));
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z');
    svg.append(path);
    return svg;
  };

  /**
   * "Directions" button. The visible words are contained in the aria-label (WCAG 2.5.3 Label in Name).
   * The click opens Google Maps directions in a new tab; noopener/noreferrer keep the new page from reaching us.
   */
  const mapsButton = (item) => {
    const url = directionsUrl(item.locationName);
    return h('button', {
      type: 'button',
      class: 'btn btn--primary btn--maps',
      'data-maps-url': url,
      'aria-label': `${T.directions} إلى ${item.title}، يفتح في نافذة جديدة`,
    }, pinIcon(), h('span', { text: T.directions }));
  };

  const openMaps = (url) => {
    if (!/^https:\/\/www\.google\.com\/maps\/(dir\/\?api=1&destination|search\/\?api=1&query)=/.test(url)) return false;
    try { window.open(url, '_blank', 'noopener,noreferrer'); return true; } catch (error) { console.error('[AuraCatalog] could not open maps:', error); return false; }
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest && event.target.closest('button[data-maps-url]');
    if (!button) return;
    event.preventDefault();
    if (!openMaps(button.dataset.mapsUrl) && window.AuraAccess && window.AuraAccess.announceSilently) {
      window.AuraAccess.announceSilently('تعذّر فتح خرائط جوجل. حاول مرة أخرى.');
    }
  });

  /** "all" stands for every token, so the existing AND-filter keeps its meaning. */
  const accessTokens = (list) => (list.includes('all') ? ACCESS_IDS : list);
  const accessLabels = (list) => (list.includes('all') ? [T.allAccess] : list.map((id) => LABEL.access[id]));
  const cityLabels = (list) => (list.includes('all') ? [T.allCities] : list.map((id) => LABEL.city[id]));

  const checkList = (list, allowed, name, id) => {
    if (!Array.isArray(list) || !list.length) return `${id}: ${name} is empty`;
    const bad = list.filter((value) => value !== 'all' && !allowed.includes(value));
    return bad.length ? `${id}: unknown ${name} value(s) ${bad.join(', ')}` : '';
  };

  /** Returns a list of problems; an item with any problem is skipped (never half-rendered). */
  const validate = (item, kind) => {
    const id = item && item.id ? item.id : '(no id)';
    const problems = [];
    if (!item || !/^[a-z0-9-]+$/.test(item.id || '')) problems.push(`${id}: id must match [a-z0-9-]+`);
    ['title', 'org', 'summary'].forEach((field) => {
      if (!item || typeof item[field] !== 'string' || !item[field].trim()) problems.push(`${id}: ${field} is required`);
    });
    if (item) {
      // A place whose accessibility is still unknown may list no access type (it is never claimed for anyone)
      const accessMayBeEmpty = kind === 'place' && item.status === 'unknown' && Array.isArray(item.access) && !item.access.length;
      problems.push(checkList(item.cities, CITY_IDS, 'cities', id), accessMayBeEmpty ? '' : checkList(item.access, ACCESS_IDS, 'access', id));
      if (!item.source || !isHttps(item.source.url) || !item.source.label) problems.push(`${id}: source {label, url(https)} is required`);
      if (!item.verification || !['confirmed', 'partial'].includes(item.verification.status)) problems.push(`${id}: verification.status is required`);
      if (item.locationName !== undefined && (typeof item.locationName !== 'string' || !item.locationName.trim())) problems.push(`${id}: locationName must be a non-empty string`);
      if (item.apply && !isHttps(item.apply.url)) problems.push(`${id}: apply.url must be https`);
      if (kind === 'place') {
        if (!['public', 'medical'].includes(item.type)) problems.push(`${id}: type must be public or medical`);
        if (!['open', 'partial', 'unknown'].includes(item.status)) problems.push(`${id}: status must be open, partial or unknown`);
        if (typeof item.locationName !== 'string' || !item.locationName.trim()) problems.push(`${id}: locationName is required`);
        if (item.geo && !(Number.isFinite(item.geo.lat) && Number.isFinite(item.geo.lng))) problems.push(`${id}: geo must hold finite lat and lng`);
      }
    }
    return problems.filter(Boolean);
  };

  const keywords = (item, extra) =>
    [item.title, item.org, item.area, ...(item.tags || []), ...cityLabels(item.cities), ...accessLabels(item.access), extra]
      .filter(Boolean).join(' ');

  /* ---------- shared pieces ---------- */
  const externalLink = (url, text, hiddenSuffix) =>
    h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' },
      text, h('span', { class: 'visually-hidden', text: hiddenSuffix || T.newWindow }));

  const tagList = (item) =>
    h('ul', { class: 'tag-list', 'aria-label': 'تفاصيل' },
      [...cityLabels(item.cities), ...accessLabels(item.access), ...(item.tags || [])]
        .map((text) => h('li', { class: 'tag', text })));

  /** Verification block: glyph + words (never colour alone), the source link, the date and the caveat. */
  const verification = (item, className) => {
    const confirmed = item.verification.status === 'confirmed';
    return h('div', { class: className },
      h('p', { class: `badge ${confirmed ? 'badge--open' : 'badge--partial'}` },
        h('span', { class: 'visually-hidden', text: 'حالة التوثيق: ' }), confirmed ? T.confirmed : T.partial),
      h('p', { class: 'verify__source' },
        `${T.sourceLabel} `, externalLink(item.source.url, item.source.label),
        ` · ${T.checkedOn} `, h('time', { datetime: item.verification.checked, dir: 'ltr', text: item.verification.checked })),
      item.verification.note ? h('p', { class: 'verify__note', text: item.verification.note }) : null);
  };

  const modalButton = (label, context, name) =>
    h('button', { type: 'button', class: 'btn btn--secondary', 'data-open-modal': 'booking-modal', 'data-context': context },
      label, h('span', { class: 'visually-hidden', text: ` بخصوص ${name}` }));

  /* ---------- course / tool card ---------- */
  const oppCard = (item, kind) => {
    const titleId = `cat-${item.id}-title`;
    const kindLabel = kind === 'course' ? T.course : T.tool;
    const actions = h('div', { class: 'card__actions' });
    if (item.locationName) actions.append(mapsButton(item));
    if (item.apply) {
      actions.append(h('a', { class: 'btn btn--primary', href: item.apply.url, target: '_blank', rel: 'noopener noreferrer' },
        item.apply.label, h('span', { class: 'visually-hidden', text: ` ${item.title}${T.newWindow}` })));
    }
    actions.append(modalButton(kind === 'course' ? T.requestCourse : T.requestTool, `${kindLabel}: ${item.title}`, item.title));

    return h('li', {
      id: `opp-${item.id}`,
      class: 'opp-grid__item',
      'data-category': kind,
      'data-access': accessTokens(item.access).join(' '),
      'data-city': item.cities.join(' '),
      'data-keywords': keywords(item, kindLabel),
    },
    h('article', { class: 'card', 'aria-labelledby': titleId },
      h('p', { class: 'card__kind', text: kindLabel }),
      h('h3', { id: titleId, class: 'card__title', text: item.title }),
      h('p', { class: 'card__org', text: item.org }),
      h('p', { class: 'card__text', text: item.summary }),
      tagList(item),
      item.facts && item.facts.length
        ? h('ul', { class: 'card__facts', 'aria-label': 'معلومات إضافية' }, item.facts.map((fact) => h('li', { text: fact })))
        : null,
      verification(item, 'verify'),
      actions));
  };

  /* ---------- place card ---------- */
  const placeCard = (item) => {
    const titleId = `place-${item.id}-title`;
    const attrs = {
      id: `place-${item.id}`,
      class: 'place-list__item',
      'data-place-type': item.type,
      'data-status': item.status,
      'data-access': accessTokens(item.access).join(' '),
      'data-city': item.cities.join(' '),
      'data-keywords': keywords(item),
    };
    if (item.locationName) attrs['data-map-query'] = item.locationName;

    const meta = [item.org, item.area, ...cityLabels(item.cities)].filter(Boolean).join(' · ');
    return h('li', attrs,
      h('article', { class: 'place', 'aria-labelledby': titleId },
        h('header', { class: 'place__header' },
          h('h3', { id: titleId, class: 'place__title', text: item.title }),
          h('p', { class: `badge badge--${item.status}` }, h('span', { class: 'visually-hidden', text: 'الحالة: ' }), item.statusLabel)),
        h('p', { class: 'place__meta', text: meta }),
        h('p', { class: 'place__text', text: item.summary }),
        tagList(item),
        verification(item, 'verify'),
        h('div', { class: 'place__links' },
          mapsButton(item),
          modalButton(T.requestVisit, item.title, item.title))));
  };

  /* ---------- render ---------- */
  const build = (items, kind, make) => {
    const seen = new Set();
    const nodes = [];
    (items || []).forEach((item) => {
      const problems = validate(item, kind);
      if (item && seen.has(item.id)) problems.push(`${item.id}: duplicate id`);
      if (problems.length) { console.warn('[AuraCatalog] skipped:', problems.join('; ')); return; }
      seen.add(item.id);
      nodes.push(make(item));
    });
    return nodes;
  };

  const mount = (listEl, nodes) => {
    if (!listEl) return 0;
    listEl.replaceChildren(...nodes);
    return nodes.length;
  };

  const render = () => {
    const opps = [
      ...build(data.courses, 'course', (item) => oppCard(item, 'course')),
      ...build(data.tools, 'tool', (item) => oppCard(item, 'tool')),
    ];
    const places = build(data.places, 'place', placeCard);
    const result = { opportunities: mount(oppList, opps), places: mount(placeList, places) };
    // Filters and the places map are built on top of the list: tell them if we ran late
    if (window.AuraPlaceMap && typeof window.AuraPlaceMap.refresh === 'function') window.AuraPlaceMap.refresh();
    if (window.AuraAccess && typeof window.AuraAccess.refreshFilters === 'function') window.AuraAccess.refreshFilters();
    return result;
  };

  render();

  window.AuraCatalog = Object.freeze({
    version: '1.0.0',
    render,
    _internals: Object.freeze({ mapsUrl, directionsUrl, validate, accessTokens, openMaps }),
  });
})();
