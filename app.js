/* ==========================================================================
   AuraAccess — app.js   (toolbar, text-to-speech, dialogs, filters, announcements)

   Plain ES2020, no dependencies, classic script (works from file:// and with
   <script defer>). Everything lives inside one closure; the only global is
   window.AuraAccess, which later modules (filters, dialog) can use.

   DOM contract (ids come from template.html):
     #btn-font-dec  #btn-font-inc  #font-size-output     font scaler
     #btn-contrast  #btn-dyslexia  #btn-theme              aria-pressed toggles
     #btn-speech                                         aria-pressed toggle
     #btn-reset                                          back to defaults
     #toast  #toast-message  #toast-dismiss              polite status toast
     #nav-toggle  #main-nav                              mobile menu button and the menu
     #sr-live                                            screen-reader-only polite region
     #alert-live                                         assertive (not used here)
     [data-open-modal="id"]  [data-close-modal]          dialog triggers and closers
     #booking-modal[data-modal] > [role=dialog][data-focus-trap]
     form[data-filter-form] with [data-filter-group] controls, and a list of
       <li> items carrying data-category / data-place-type / data-access

   CSS contract (css/styles.css):
     body.dyslexic-font              dyslexia-friendly typography
     html[data-theme="dark|light"]    explicit colour theme (no attribute = follow the OS)
     html { --font-scale: 1 .. 2 }   the CSS multiplies the browser's own font
                                     size by it, so we never write px sizes
     body.high-contrast              the high-contrast theme
     #toast[data-state="idle|visible"]

   The "js" class on <html> is added by Nav.bind(), and only after the menu
   button is wired up. Without that class the CSS keeps the navigation fully
   visible, so a failed script can never leave a phone user without a menu.
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     1. Configuration and messages
     ------------------------------------------------------------------------ */
  const CONFIG = Object.freeze({
    storageKey: 'auraaccess.prefs.v1',
    // 100% is the user's own browser size; 200% is the WCAG 1.4.4 requirement.
    // We never go below 100%: shrinking text below the user's default hurts.
    font: Object.freeze({ min: 1, max: 2, step: 0.1 }),
    speechRate: Object.freeze({ min: 0.5, max: 2 }),
    speech: Object.freeze({
      rate: 0.95,
      pitch: 1,
      volume: 1,
      hoverDelay: 400,    // ms the pointer must rest on a card before it is read
      focusDelay: 150,    // ms debounce while tabbing quickly through cards
      repeatGuard: 1500,  // ms during which the same card is not read twice
      maxChunk: 200,      // characters per utterance (long ones stall in Chrome)
    }),
    // Default speech language when <html lang> has no region
    langMap: Object.freeze({ ar: 'ar-EG', en: 'en-US' }),
    filter: Object.freeze({
      announceDelay: 450,   // ms to wait after the last click before announcing results
      searchDelay: 800,     // longer while typing, so each keystroke is not announced
    }),
    booking: Object.freeze({
      // null = demo mode: the request is validated and "sent" locally only.
      // Set a URL (same origin or CORS-enabled) to POST the form as JSON.
      endpoint: null,
      timeout: 10000,
    }),
  });

  const SELECTORS = Object.freeze({
    // Anything that should be read as a unit when focused or hovered.
    // Add data-tts to any other block to opt it in.
    readable: '.card, .place, [data-tts]',
    // Never read: actions, icons, hidden or decorative content
    skip: 'button, a[href], svg, script, style, template, input, select, textarea, [hidden], [aria-hidden="true"]',
    // Elements whose text becomes one spoken phrase
    phrase: 'H1,H2,H3,H4,H5,H6,P,LI,SUMMARY,FIGCAPTION,DT,DD',
    // Dialogs
    focusable: 'a[href], area[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable="true"]',
    background: '#page-wrapper',       // made inert and hidden while a dialog is open
    allowOutside: '#toast',            // may still be clicked while a dialog is open
    fallbackFocus: '#main-content',    // used if the element that opened the dialog is gone
  });

  const MSG = Object.freeze({
    fontSet: (pct) => `حجم الخط ${pct}%`,
    fontMax: (pct) => `وصلت إلى أكبر حجم للخط، ${pct}%`,
    fontMin: (pct) => `هذا هو الحجم الأصلي للخط، ${pct}%`,
    contrastOn: 'تم تشغيل التباين العالي',
    contrastOff: 'تم إيقاف التباين العالي',
    dyslexiaOn: 'تم تشغيل الخط المناسب لعسر القراءة',
    dyslexiaOff: 'تم إيقاف الخط المناسب لعسر القراءة',
    themeDark: 'تم تشغيل الوضع الداكن',
    themeLight: 'تم تشغيل الوضع الفاتح',
    themeSystem: 'المظهر الآن يتبع إعدادات جهازك',
    rateSet: (label) => `سرعة الصوت: ${label}`,
    ttsSample: 'هذه تجربة لسرعة الصوت في منصة آورا أكسس.',
    ttsOn: 'تم تشغيل القراءة بصوت عالٍ. مرّر المؤشر على أي بطاقة أو انتقل إليها بالكيبورد لتُقرأ.',
    ttsOff: 'تم إيقاف القراءة بصوت عالٍ',
    ttsUnsupported: 'القراءة بصوت عالٍ غير متاحة في هذا المتصفح.',
    ttsNoVoice: 'لا يوجد صوت عربي مثبّت على جهازك، وقد تُقرأ البطاقات بصوت آخر.',
    ttsBlocked: 'منع المتصفح القراءة. اضغط في أي مكان من الصفحة ثم حاول مرة أخرى.',
    ttsFailed: 'تعذّرت القراءة بصوت عالٍ على هذا الجهاز.',
    resetDone: 'تمت إعادة ضبط كل الخيارات',
    storageOff: 'لن يتم حفظ تفضيلاتك لأن المتصفح يمنع التخزين. ستعود إلى الإعدادات الافتراضية عند إعادة التحميل.',
    // dialog and booking form
    context: (name) => `بخصوص: ${name}`,
    errName: 'أدخل اسمك الكامل (حرفان على الأقل).',
    errContact: 'أدخل بريدًا إلكترونيًا صحيحًا مثل name@example.com أو رقم هاتف.',
    errType: 'اختر نوع المساعدة.',
    errDate: 'اختر تاريخ اليوم أو يومًا لاحقًا.',
    errConsent: 'ضع علامة في المربع للمتابعة.',
    errSend: 'تعذّر إرسال الطلب. تحقق من اتصالك بالإنترنت ثم حاول مرة أخرى.',
    errCount: (n) => {
      if (n === 1) return 'خطأ واحد يحتاج إلى تصحيح';
      if (n === 2) return 'خطآن يحتاجان إلى تصحيح';
      if (n <= 10) return `${n} أخطاء تحتاج إلى تصحيح`;
      return `${n} خطأً يحتاج إلى تصحيح`;
    },
    // filters
    filterSearch: 'بحث',
    filterActive: (labels) => `التصفية الحالية: ${labels}.`,
    filterEmptyHint: 'أزل إحدى التصفيات أو غيّر كلمة البحث.',
    filterCleared: 'تم مسح التصفية.',
    // voice search
    voiceUnsupported: 'البحث الصوتي غير متاح في هذا المتصفح. اكتب في خانة البحث.',
    voiceListening: 'جارٍ الاستماع. قل اسم الخدمة أو المكان.',
    voiceHeard: (text) => `تم البحث عن: ${text}`,
    voiceDenied: 'لم يُسمح باستخدام الميكروفون. فعّله من إعدادات المتصفح أو اكتب في خانة البحث.',
    voiceNothing: 'لم أسمع شيئًا. حاول مرة أخرى.',
    voiceFailed: 'تعذّر البحث الصوتي الآن. اكتب في خانة البحث.',
  });

  /* ------------------------------------------------------------------------
     2. Small utilities
     ------------------------------------------------------------------------ */
  const $ = (id) => document.getElementById(id);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const round2 = (n) => Math.round(n * 100) / 100;

  const matches = (query) => {
    try {
      return typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
    } catch (error) {
      return false;
    }
  };

  /** Cache for elements; filled by cacheDom() once the document is ready. */
  const ui = {};

  const cacheDom = () => {
    ui.fontDec = $('btn-font-dec');
    ui.fontInc = $('btn-font-inc');
    ui.fontOut = $('font-size-output');
    ui.contrast = $('btn-contrast');
    ui.dyslexia = $('btn-dyslexia');
    ui.theme = $('btn-theme');
    ui.speech = $('btn-speech');
    ui.reset = $('btn-reset');
    ui.voice = $('btn-voice-search');
    ui.profileBtn = $('profile-toggle');
    ui.profilePanel = $('profile-panel');
    ui.settingsForm = $('settings-form');
    ui.setFontStatus = $('set-font-status');
    ui.setSpeech = $('set-speech');
    ui.setDyslexia = $('set-dyslexia');
    ui.setPreview = $('btn-voice-preview');
    ui.setReset = $('btn-reset-settings');
    ui.toast = $('toast');
    ui.toastMsg = $('toast-message');
    ui.toastDismiss = $('toast-dismiss');
    ui.srLive = $('sr-live') || createSrRegion();
  };

  /** Safety net: the region normally ships in the HTML; create it if it is missing. */
  const createSrRegion = () => {
    const region = document.createElement('div');
    region.id = 'sr-live';
    region.className = 'visually-hidden';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.append(region);
    return region;
  };

  /**
   * Disable a button WITHOUT removing it from the tab order. A real `disabled`
   * attribute would drop keyboard focus to <body> the moment a limit is reached.
   */
  const setAriaDisabled = (button, disabled) => {
    if (button) button.setAttribute('aria-disabled', String(disabled));
  };

  /* ------------------------------------------------------------------------
     3. Preference storage (localStorage can be missing, full or blocked)
     ------------------------------------------------------------------------ */
  const Store = (() => {
    let memory = null;   // used when localStorage is unavailable
    let broken = false;

    const read = () => {
      try {
        const raw = window.localStorage.getItem(CONFIG.storageKey);
        if (raw === null) return memory;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch (error) {
        broken = true;
        return memory;
      }
    };

    const write = (data) => {
      memory = data;
      try {
        window.localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        return true;
      } catch (error) {
        broken = true;
        return false;
      }
    };

    const clear = () => {
      memory = null;
      try {
        window.localStorage.removeItem(CONFIG.storageKey);
      } catch (error) {
        broken = true;
      }
    };

    return { read, write, clear, isPersistent: () => !broken };
  })();

  /** Snap any number onto the allowed scale grid: 1.0, 1.1 ... 2.0 */
  const snapScale = (value) => {
    const { min, max, step } = CONFIG.font;
    const steps = Math.round((clamp(value, min, max) - min) / step);
    return clamp(round2(min + steps * step), min, max);
  };

  /** Keep only valid keys from whatever was stored (it may be old or edited by hand). */
  const sanitizePrefs = (raw) => {
    const clean = {};
    if (!raw || typeof raw !== 'object') return clean;
    const scale = Number(raw.fontScale);
    if (raw.fontScale !== null && raw.fontScale !== '' && Number.isFinite(scale)) {
      clean.fontScale = snapScale(scale);
    }
    if (typeof raw.highContrast === 'boolean') clean.highContrast = raw.highContrast;
    if (typeof raw.dyslexia === 'boolean') clean.dyslexia = raw.dyslexia;
    if (raw.theme === 'dark' || raw.theme === 'light') clean.theme = raw.theme;   // anything else = follow the OS
    const rate = Number(raw.ttsRate);
    if (raw.ttsRate !== null && raw.ttsRate !== '' && Number.isFinite(rate)) clean.ttsRate = round2(clamp(rate, CONFIG.speechRate.min, CONFIG.speechRate.max));
    return clean;
  };

  /* ------------------------------------------------------------------------
     4. State
     ------------------------------------------------------------------------ */
  const DEFAULTS = Object.freeze({ fontScale: CONFIG.font.min, highContrast: false, dyslexia: false, theme: null, ttsRate: CONFIG.speech.rate });

  /** First visit: follow the operating system's "more contrast" setting. */
  const defaultContrast = () => matches('(prefers-contrast: more)');

  const state = {
    fontScale: DEFAULTS.fontScale,
    highContrast: DEFAULTS.highContrast,
    dyslexia: DEFAULTS.dyslexia,
    theme: DEFAULTS.theme,            // 'dark' | 'light' | null (follow the operating system)
    ttsRate: DEFAULTS.ttsRate,        // voice speed, 0.5 to 2 (saved)
    speech: false, // never persisted: a page that starts talking on load is hostile
  };

  let storageWarned = false;

  /**
   * Save the preferences. Returns a warning sentence the FIRST time saving fails
   * (blocked storage), otherwise an empty string. The caller adds it to its own
   * announcement: two separate toasts would overwrite each other.
   */
  const persist = () => {
    const saved = Store.write({
      fontScale: state.fontScale,
      highContrast: state.highContrast,
      dyslexia: state.dyslexia,
      theme: state.theme,
      ttsRate: state.ttsRate,
    });
    if (saved || storageWarned) return '';
    storageWarned = true;
    return MSG.storageOff;
  };

  const join = (...parts) => parts.filter(Boolean).join(' ');

  const loadPrefs = () => {
    const saved = sanitizePrefs(Store.read());
    state.fontScale = 'fontScale' in saved ? saved.fontScale : DEFAULTS.fontScale;
    state.highContrast = 'highContrast' in saved ? saved.highContrast : defaultContrast();
    state.dyslexia = 'dyslexia' in saved ? saved.dyslexia : DEFAULTS.dyslexia;
    state.theme = 'theme' in saved ? saved.theme : DEFAULTS.theme;
    state.ttsRate = 'ttsRate' in saved ? saved.ttsRate : DEFAULTS.ttsRate;
  };

  /* ------------------------------------------------------------------------
     5. Announcer: visible toast + polite live region
     The live region exists in the page from the start and is only filled with
     text here, because screen readers announce changes inside a region that is
     already present, not a region that appears together with its text.
     ------------------------------------------------------------------------ */
  const Announcer = (() => {
    let fillTimer = 0;
    let hideTimer = 0;
    let paused = false;

    const hide = () => {
      window.clearTimeout(hideTimer);
      if (!ui.toast) return;
      ui.toast.dataset.state = 'idle';
      if (ui.toastMsg) ui.toastMsg.textContent = '';
      if (ui.toastDismiss) ui.toastDismiss.hidden = true;
    };

    const scheduleHide = (ms) => {
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        if (paused) return;   // resumed by mouseleave / focusout
        hide();
      }, ms);
    };

    /** Show a message. Longer messages stay longer (4 to 10 seconds). */
    const say = (message) => {
      if (!ui.toast || !ui.toastMsg || !message) return;
      window.clearTimeout(fillTimer);
      // Clear first, then fill: the same sentence twice is still announced
      ui.toastMsg.textContent = '';
      fillTimer = window.setTimeout(() => {
        ui.toastMsg.textContent = message;
        ui.toast.dataset.state = 'visible';
        if (ui.toastDismiss) ui.toastDismiss.hidden = false;
        scheduleHide(clamp(message.length * 70, 4000, 10000));
      }, 80);
    };

    let srFillTimer = 0;
    let srClearTimer = 0;

    /**
     * Speak-only announcement: no visible toast. Used when the page already shows
     * the change (a filtered list), so sighted users are not distracted.
     */
    const sr = (message) => {
      if (!ui.srLive || !message) return;
      window.clearTimeout(srFillTimer);
      window.clearTimeout(srClearTimer);
      ui.srLive.textContent = '';
      srFillTimer = window.setTimeout(() => {
        ui.srLive.textContent = message;
        // Clear later so the sentence is not found again by the reading cursor
        srClearTimer = window.setTimeout(() => { ui.srLive.textContent = ''; }, 8000);
      }, 60);
    };

    const bind = () => {
      if (!ui.toast) return;
      if (ui.toastDismiss) ui.toastDismiss.addEventListener('click', hide);
      // Do not remove a message while someone is reading it or has it focused
      const pause = () => { paused = true; window.clearTimeout(hideTimer); };
      const resume = () => { paused = false; scheduleHide(2500); };
      ui.toast.addEventListener('mouseenter', pause);
      ui.toast.addEventListener('mouseleave', resume);
      ui.toast.addEventListener('focusin', pause);
      ui.toast.addEventListener('focusout', resume);
    };

    return { say, sr, hide, bind };
  })();

  /* ------------------------------------------------------------------------
     6. Font scaler
     ------------------------------------------------------------------------ */
  const renderFont = () => {
    const { min, max } = CONFIG.font;
    document.documentElement.style.setProperty('--font-scale', String(state.fontScale));
    // From 150% the sticky header would cover too much of the screen: the CSS lets it scroll away
    document.documentElement.classList.toggle('text-large', state.fontScale >= 1.5);
    if (ui.fontOut) ui.fontOut.textContent = `${Math.round(state.fontScale * 100)}%`;
    setAriaDisabled(ui.fontDec, state.fontScale <= min);
    setAriaDisabled(ui.fontInc, state.fontScale >= max);
    renderSettings();
  };

  /** direction: +1 larger, -1 smaller */
  const changeFont = (direction) => {
    const { min, max, step } = CONFIG.font;
    const pct = Math.round(state.fontScale * 100);

    if (direction > 0 && state.fontScale >= max) return Announcer.say(MSG.fontMax(pct));
    if (direction < 0 && state.fontScale <= min) return Announcer.say(MSG.fontMin(pct));

    state.fontScale = snapScale(state.fontScale + direction * step);
    renderFont();
    const warning = persist();
    return Announcer.say(join(MSG.fontSet(Math.round(state.fontScale * 100)), warning));
  };

  /** Jump to a size (the settings view); changeFont() above steps by 10%. */
  const setFontScale = (value) => {
    const next = snapScale(Number(value));
    if (next === state.fontScale) return;
    state.fontScale = next;
    renderFont();
    const warning = persist();
    Announcer.say(join(MSG.fontSet(Math.round(next * 100)), warning));
  };

  /* ------------------------------------------------------------------------
     7. Display toggles: contrast and dyslexia-friendly font
        (classes go on <body>; the CSS works on html or body too)
     ------------------------------------------------------------------------ */
  const renderContrast = () => {
    document.body.classList.toggle('high-contrast', state.highContrast);
    if (ui.contrast) ui.contrast.setAttribute('aria-pressed', String(state.highContrast));
    renderSettings();
  };

  const setContrast = (on) => {
    state.highContrast = Boolean(on);
    renderContrast();
    const warning = persist();
    Announcer.say(join(state.highContrast ? MSG.contrastOn : MSG.contrastOff, warning));
  };
  const toggleContrast = () => setContrast(!state.highContrast);

  /**
   * Dyslexia-friendly font. Same flow as contrast: one class on <body>, one
   * aria-pressed state, saved with the other preferences. The class name matches
   * the CSS (.dyslexic-font); the typeface, spacing and line height all live there.
   */
  const renderDyslexia = () => {
    document.body.classList.toggle('dyslexic-font', state.dyslexia);
    if (ui.dyslexia) ui.dyslexia.setAttribute('aria-pressed', String(state.dyslexia));
    renderSettings();
  };

  const setDyslexia = (on) => {
    state.dyslexia = Boolean(on);
    renderDyslexia();
    const warning = persist();
    Announcer.say(join(state.dyslexia ? MSG.dyslexiaOn : MSG.dyslexiaOff, warning));
  };
  const toggleDyslexia = () => setDyslexia(!state.dyslexia);

  /**
   * Colour theme. Three states: explicit 'dark', explicit 'light', or none (follow the OS).
   * The CSS reads html[data-theme]; with no attribute it follows prefers-color-scheme itself,
   * so first-time visitors never see a flash. The button shows the EFFECTIVE state
   * (pressed = dark is on), and one press switches to the opposite explicitly.
   * "Reset" goes back to following the OS.
   */
  const systemDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const isDark = () => (state.theme ? state.theme === 'dark' : !!(systemDark && systemDark.matches));

  const renderTheme = () => {
    const root = document.documentElement;
    if (state.theme) root.setAttribute('data-theme', state.theme);
    else root.removeAttribute('data-theme');
    if (ui.theme) ui.theme.setAttribute('aria-pressed', String(isDark()));
    renderSettings();
  };

  /** value: 'dark' | 'light' | null (follow the operating system) */
  const setTheme = (value) => {
    state.theme = value === 'dark' || value === 'light' ? value : null;
    renderTheme();
    const warning = persist();
    const message = state.theme === 'dark' ? MSG.themeDark : state.theme === 'light' ? MSG.themeLight : MSG.themeSystem;
    Announcer.say(join(message, warning));
  };
  const toggleTheme = () => setTheme(isDark() ? 'light' : 'dark');

  /* ------------------------------------------------------------------------
     8. Text-to-speech (Web Speech API)
     Reads a card when it receives keyboard focus or when the pointer rests on
     it, only while the feature is switched on. This is an aid for people who do
     not run a screen reader; with a screen reader running, leave it off.
     ------------------------------------------------------------------------ */
  const Speech = (() => {
    const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    const synth = supported ? window.speechSynthesis : null;

    let enabled = false;
    let voices = [];
    let token = 0;            // identifies the current reading; stale callbacks exit early
    let held = null;          // keeps the live utterance referenced (Chrome drops GC'd ones)
    let hoverTimer = 0;
    let focusTimer = 0;
    let lastEl = null;
    let lastAt = 0;
    let errorShown = false;

    /* ---- voices ---- */
    const refreshVoices = () => {
      try {
        voices = synth.getVoices() || [];
      } catch (error) {
        voices = [];
      }
    };

    const speechLang = () => {
      const docLang = (document.documentElement.lang || 'ar').trim();
      if (docLang.includes('-')) return docLang;
      return CONFIG.langMap[docLang.toLowerCase()] || docLang;
    };

    const normalizeLang = (lang) => String(lang || '').toLowerCase().replace('_', '-');

    /** Exact match (ar-EG), then any voice of the same language (ar-*), else null. */
    const pickVoice = (lang) => {
      const wanted = normalizeLang(lang);
      const base = wanted.split('-')[0];
      return (
        voices.find((v) => normalizeLang(v.lang) === wanted) ||
        voices.find((v) => normalizeLang(v.lang).split('-')[0] === base) ||
        null
      );
    };

    /* ---- text extraction ---- */
    const clean = (text) => text.replace(/\s+/g, ' ').trim();

    /** Visible text of an element, leaving out buttons, links and icons. */
    const textOf = (node) => {
      let out = '';
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          out += child.nodeValue;
        } else if (child.nodeType === Node.ELEMENT_NODE && !child.matches(SELECTORS.skip)) {
          out += ` ${textOf(child)} `;
        }
      });
      return clean(out);
    };

    const collect = (node, phrases) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const text = clean(child.nodeValue);
          if (text) phrases.push(text);
        } else if (child.nodeType === Node.ELEMENT_NODE && !child.matches(SELECTORS.skip)) {
          if (SELECTORS.phrase.split(',').includes(child.tagName)) {
            const text = textOf(child);
            if (text) phrases.push(text);
          } else {
            collect(child, phrases);
          }
        }
      });
    };

    /** Title, text, tags and status become short sentences with natural pauses. */
    const extractSpeechText = (element) => {
      const phrases = [];
      collect(element, phrases);
      return phrases
        .map((p) => p.replace(/[\s.!?؟،,;:؛…]+$/u, ''))
        .filter(Boolean)
        .join('. ');
    };

    /** Split into sentence-sized chunks, never longer than maxChunk. */
    const chunkText = (text) => {
      const max = CONFIG.speech.maxChunk;
      const sentences = text.match(/[^.!?؟…]+[.!?؟…]*\s*/gu) || [text];
      const chunks = [];
      let current = '';

      const push = (piece) => {
        // A single sentence longer than max is cut at spaces
        let rest = piece.trim();
        while (rest.length > max) {
          let cut = rest.lastIndexOf(' ', max);
          if (cut < 1) cut = max;
          chunks.push(rest.slice(0, cut).trim());
          rest = rest.slice(cut).trim();
        }
        return rest;
      };

      sentences.forEach((sentence) => {
        if ((current + sentence).length <= max) {
          current += sentence;
        } else {
          if (current.trim()) chunks.push(current.trim());
          current = push(sentence);
        }
      });
      if (current.trim()) chunks.push(current.trim());
      return chunks;
    };

    /* ---- playback ---- */
    const reportError = (error) => {
      if (error === 'interrupted' || error === 'canceled') return;   // normal when switching cards
      if (errorShown) return;
      errorShown = true;
      Announcer.say(error === 'not-allowed' ? MSG.ttsBlocked : MSG.ttsFailed);
    };

    const stop = () => {
      token += 1;
      window.clearTimeout(hoverTimer);
      window.clearTimeout(focusTimer);
      held = null;
      if (!synth) return;
      try {
        synth.cancel();
      } catch (error) {
        /* nothing is speaking; ignore */
      }
    };

    const speak = (text) => {
      if (!synth || !text) return;
      stop();
      const current = token;
      const parts = chunkText(text);
      const lang = speechLang();
      const voice = pickVoice(lang);
      let index = 0;

      const next = () => {
        if (current !== token || index >= parts.length) return;
        try {
          const utterance = new window.SpeechSynthesisUtterance(parts[index]);
          index += 1;
          utterance.lang = voice ? voice.lang : lang;
          if (voice) utterance.voice = voice;
          utterance.rate = state.ttsRate;
          utterance.pitch = CONFIG.speech.pitch;
          utterance.volume = CONFIG.speech.volume;
          utterance.onend = next;
          utterance.onerror = (event) => reportError(event && event.error);
          held = utterance;
          synth.speak(utterance);
        } catch (error) {
          reportError('synthesis-failed');
        }
      };

      // cancel() followed immediately by speak() is dropped by some Chrome builds
      window.setTimeout(next, 30);
    };

    const readElement = (element) => {
      const now = Date.now();
      if (element === lastEl && now - lastAt < CONFIG.speech.repeatGuard) return;
      lastEl = element;
      lastAt = now;
      speak(extractSpeechText(element));
    };

    /* ---- events (delegated: works for cards added or re-rendered later) ---- */
    const targetOf = (event) => {
      const origin = event.target;
      return origin && origin.closest ? origin.closest(SELECTORS.readable) : null;
    };

    // Moving between children of the same card must not restart the reading
    const movedWithin = (element, related) =>
      Boolean(related && related.nodeType === Node.ELEMENT_NODE && element.contains(related));

    const onFocusIn = (event) => {
      if (!enabled) return;
      const element = targetOf(event);
      if (!element || movedWithin(element, event.relatedTarget)) return;
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => readElement(element), CONFIG.speech.focusDelay);
    };

    const onMouseOver = (event) => {
      if (!enabled) return;
      const element = targetOf(event);
      if (!element || movedWithin(element, event.relatedTarget)) return;
      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => readElement(element), CONFIG.speech.hoverDelay);
    };

    const onMouseOut = (event) => {
      const element = targetOf(event);
      if (element && !movedWithin(element, event.relatedTarget)) window.clearTimeout(hoverTimer);
    };

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && enabled) stop();   // silence now, keep the feature on
    };

    const bind = () => {
      if (!supported) return;
      refreshVoices();
      if (typeof synth.addEventListener === 'function') {
        synth.addEventListener('voiceschanged', refreshVoices);
      } else {
        synth.onvoiceschanged = refreshVoices;
      }
      document.addEventListener('focusin', onFocusIn);
      document.addEventListener('mouseover', onMouseOver);
      document.addEventListener('mouseout', onMouseOut);
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
      window.addEventListener('pagehide', stop);
    };

    const enable = () => {
      enabled = true;
      errorShown = false;
      refreshVoices();
      // Only warn when the browser has listed its voices and none fits the language
      return voices.length > 0 && !pickVoice(speechLang());
    };

    const disable = () => {
      enabled = false;
      lastEl = null;
      stop();
    };

    return { supported, bind, enable, disable, stop, speak, isEnabled: () => enabled };
  })();

  const renderSpeech = () => {
    if (ui.speech) ui.speech.setAttribute('aria-pressed', String(state.speech));
    renderSettings();
  };

  const RATE_LABELS = Object.freeze({ 0.7: 'بطيء', 0.95: 'عادي', 1.2: 'سريع', 1.5: 'سريع جدًا' });

  const setRate = (value) => {
    state.ttsRate = round2(clamp(Number(value), CONFIG.speechRate.min, CONFIG.speechRate.max));
    renderSettings();
    const warning = persist();
    Announcer.say(join(MSG.rateSet(RATE_LABELS[state.ttsRate] || String(state.ttsRate)), warning));
  };

  /** Say a sample sentence at the chosen speed (works even while reading-on-hover is off). */
  const previewVoice = () => {
    if (!Speech.supported) { Announcer.say(MSG.ttsUnsupported); return; }
    Speech.speak(MSG.ttsSample);
  };

  const toggleSpeech = () => setSpeech(!state.speech);

  const setSpeech = (on) => {
    if (!Speech.supported) {
      Announcer.say(MSG.ttsUnsupported);
      renderSpeech();
      return;
    }
    if (Boolean(on) === state.speech) return;
    state.speech = Boolean(on);
    if (state.speech) {
      const missingVoice = Speech.enable();
      Announcer.say(missingVoice ? `${MSG.ttsOn} ${MSG.ttsNoVoice}` : MSG.ttsOn);
    } else {
      Speech.disable();
      Announcer.say(MSG.ttsOff);
    }
    renderSpeech();
  };

  /* ------------------------------------------------------------------------
     9. Shared text helpers (Arabic-aware)
     ------------------------------------------------------------------------ */

  /**
   * Make text comparable: no diacritics or tatweel, one form of alef, yaa and
   * taa marbuta, Arabic-Indic digits as Latin digits, lower-case Latin.
   * So "قارئ الشاشه" finds "قارئ الشاشة", and "٦ أسابيع" finds "6 أسابيع".
   */
  const normalizeText = (value) =>
    String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[آأإ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .replace(/\s+/g, ' ')
      .trim();

  /** Arabic counting: 1 and 2 have their own forms, 3 to 10 take the plural. */
  const countPhrase = (n, nouns) => {
    if (n === 1) return nouns.one;
    if (n === 2) return nouns.two;
    if (n <= 10) return `${n} ${nouns.few}`;
    return `${n} ${nouns.many}`;
  };

  const isVisible = (element) => {
    if (!element || element.closest('[hidden]')) return false;
    const style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0;
  };

  /* ------------------------------------------------------------------------
     10. Modal controller
     Opens and closes any [data-modal]. While one is open:
       - the page behind it is inert (and aria-hidden where inert is missing),
       - Tab and Shift+Tab cycle inside the dialog and cannot leave it,
       - Escape and the backdrop close it,
       - page scrolling is locked without the layout jumping,
     and on close focus returns to the element that opened it.
     Other modules react through events on the modal element:
       modal:beforeopen (detail.trigger)   modal:open   modal:close
     ------------------------------------------------------------------------ */
  const Modals = (() => {
    const stack = [];                      // open dialogs; the last one is on top
    let savedPadding = '';
    const supportsInert = 'inert' in HTMLElement.prototype;

    /** Elements Tab can reach inside a container, in order. */
    const focusableIn = (container) =>
      Array.from(container.querySelectorAll(SELECTORS.focusable)).filter((element) => {
        if (element.disabled || element.tabIndex < 0 || !isVisible(element)) return false;
        if (element.type === 'radio' && element.name) {
          // A radio group is ONE tab stop: the checked one, or else the first
          const group = Array.from(container.querySelectorAll('input[type="radio"]'))
            .filter((radio) => radio.name === element.name && !radio.disabled);
          return element === (group.find((radio) => radio.checked) || group[0]);
        }
        return true;
      });

    const setBackground = (blocked) => {
      document.querySelectorAll(SELECTORS.background).forEach((node) => {
        node.toggleAttribute('inert', blocked);
        if (!supportsInert) {   // older browsers: hide from assistive tech by hand
          if (blocked) node.setAttribute('aria-hidden', 'true');
          else node.removeAttribute('aria-hidden');
        }
      });
    };

    const lockPage = () => {
      // The scrollbar disappears when scrolling is locked; pad by its width so the
      // page behind the dialog does not shift sideways
      const gap = window.innerWidth - document.documentElement.clientWidth;
      savedPadding = document.body.style.paddingInlineEnd;
      if (gap > 0) document.body.style.paddingInlineEnd = `${gap}px`;
      document.documentElement.classList.add('is-modal-open');
      setBackground(true);
    };

    const unlockPage = () => {
      document.documentElement.classList.remove('is-modal-open');
      document.body.style.paddingInlineEnd = savedPadding;
      setBackground(false);
    };

    const focusInitial = (dialog) => {
      if (dialog.tabIndex < 0 && !dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
      const target = dialog.querySelector('[data-initial-focus]') || focusableIn(dialog)[0] || dialog;
      target.focus();
    };

    const restoreFocus = (opener) => {
      // A dialog may be open underneath (stacked dialogs): keep focus inside it
      const below = stack[stack.length - 1];
      const usable = opener && opener.isConnected && isVisible(opener) && !opener.closest('[inert]');
      if (usable) {
        opener.focus();
      } else if (below) {
        focusInitial(below.dialog);
      } else {
        const fallback = document.querySelector(SELECTORS.fallbackFocus);
        if (fallback) fallback.focus();
      }
    };

    const emit = (modal, name, detail) =>
      modal.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));

    const open = (id, trigger) => {
      const modal = document.getElementById(id);
      const dialog = modal && modal.querySelector('[role="dialog"], [role="alertdialog"]');
      if (!modal || !dialog) {
        console.warn(`[AuraAccess] dialog "${id}" not found`);
        return false;
      }
      if (stack.some((entry) => entry.modal === modal)) return false;

      const opener = trigger || document.activeElement;
      emit(modal, 'modal:beforeopen', { trigger: opener });   // listeners prepare content first
      Speech.stop();                                          // do not keep reading the page behind

      if (stack.length === 0) lockPage();
      modal.hidden = false;
      modal.removeAttribute('aria-hidden');
      stack.push({ modal, dialog, opener });
      focusInitial(dialog);
      emit(modal, 'modal:open', { trigger: opener });
      return true;
    };

    const close = (id, options) => {
      const entry = id ? stack.find((item) => item.modal.id === id) : stack[stack.length - 1];
      if (!entry) return false;

      stack.splice(stack.indexOf(entry), 1);
      entry.modal.hidden = true;
      entry.modal.setAttribute('aria-hidden', 'true');
      if (stack.length === 0) unlockPage();       // the page must be active BEFORE focus returns
      emit(entry.modal, 'modal:close', {});
      if (!options || options.restoreFocus !== false) restoreFocus(entry.opener);
      return true;
    };

    const isOpen = (id) => (id ? stack.some((entry) => entry.modal.id === id) : stack.length > 0);

    /* ---- keyboard: Escape and the focus trap ---- */
    const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    const onKeyDown = (event) => {
      const top = stack[stack.length - 1];
      if (!top) return;

      if (event.key === 'Escape' && !event.isComposing && !event.defaultPrevented) {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusableIn(top.dialog);
      if (items.length === 0) {                       // nothing to tab to: stay put
        event.preventDefault();
        top.dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = !top.dialog.contains(active);

      if (event.shiftKey) {
        // On the first control, on the dialog or its title (both come before the
        // first control), or outside: wrap to the end
        if (outside || active === first || active === top.dialog || before(active, first)) {
          event.preventDefault();
          last.focus();
        }
      } else if (outside || active === last || before(last, active)) {
        event.preventDefault();
        first.focus();
      }
    };

    /** If focus ever lands outside (old browser without inert, script), pull it back. */
    const onFocusIn = (event) => {
      const top = stack[stack.length - 1];
      if (!top) return;
      const target = event.target;
      if (top.dialog.contains(target)) return;
      if (target.closest && target.closest(SELECTORS.allowOutside)) return;
      (focusableIn(top.dialog)[0] || top.dialog).focus();
    };

    const onClick = (event) => {
      const origin = event.target;
      if (!origin || !origin.closest) return;

      const opener = origin.closest('[data-open-modal]');
      if (opener) {
        event.preventDefault();
        open(opener.getAttribute('data-open-modal'), opener);
        return;
      }
      const closer = origin.closest('[data-close-modal]');
      const owner = closer && closer.closest('[data-modal]');
      if (owner) close(owner.id);
    };

    const bind = () => {
      document.addEventListener('click', onClick);
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('focusin', onFocusIn);
    };

    return { bind, open, close, isOpen };
  })();

  /* ------------------------------------------------------------------------
     11. Mobile navigation
     Below 64rem the CSS collapses #main-nav unless #nav-toggle reports
     aria-expanded="true" (the toggle only exists once <html> has class "js").
     This module only flips aria-expanded; the CSS does the showing and hiding,
     so what assistive technology is told and what is drawn cannot disagree.
       - the button opens and closes the menu
       - Escape closes it and returns focus to the button
       - choosing a link closes it
       - growing the window to desktop width resets it to closed
     ------------------------------------------------------------------------ */
  const Nav = (() => {
    const DESKTOP = '(min-width: 64rem)';   // keep in sync with the CSS breakpoint
    let toggle = null;
    let menu = null;

    const isOpen = () => toggle.getAttribute('aria-expanded') === 'true';
    const setOpen = (open) => toggle.setAttribute('aria-expanded', String(open));

    /** The button is only displayed on narrow screens; on desktop the menu is always visible. */
    const isCollapsible = () => isVisible(toggle);

    const onToggle = () => setOpen(!isOpen());

    const onKeyDown = (event) => {
      // An open dialog handles Escape first and marks it as handled
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if (!isOpen() || !isCollapsible()) return;

      const focusInside = menu.contains(document.activeElement) || document.activeElement === toggle;
      setOpen(false);
      if (focusInside) toggle.focus();   // the focused link just disappeared: put focus somewhere real
    };

    const onMenuClick = (event) => {
      const tab = event.target.closest && event.target.closest('[role="tab"]');
      if (tab) {
        if (isOpen() && isCollapsible()) setOpen(false);   // js/router.js focuses the new view's <h1>
        return;
      }
      const link = event.target.closest && event.target.closest('a[href]');
      if (!link || !isOpen() || !isCollapsible()) return;
      setOpen(false);

      // The link vanishes with the menu and would take keyboard focus with it.
      // For in-page links, move focus to the section the page just scrolled to.
      const hash = link.getAttribute('href');
      if (!hash || hash.charAt(0) !== '#' || hash.length < 2) return;
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (!target) return;
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      window.setTimeout(() => target.focus({ preventScroll: true }), 0);   // after the browser's own scroll
    };

    const bind = () => {
      toggle = $('nav-toggle');
      menu = $('main-nav');
      if (!toggle || !menu) {
        console.warn('[AuraAccess] navigation markup not found; the menu stays visible');
        return;
      }

      toggle.addEventListener('click', onToggle);
      menu.addEventListener('click', onMenuClick);
      document.addEventListener('keydown', onKeyDown);

      // Reaching desktop width closes the menu, so it starts collapsed after shrinking again
      if (typeof window.matchMedia === 'function') {
        const query = window.matchMedia(DESKTOP);
        const onChange = (event) => { if (event.matches) setOpen(false); };
        if (typeof query.addEventListener === 'function') query.addEventListener('change', onChange);
        else if (typeof query.addListener === 'function') query.addListener(onChange);
      }

      setOpen(false);
      // Last step, on purpose: this class turns on the collapsing CSS
      document.documentElement.classList.add('js');
    };

    return { bind, isOpen };
  })();

  /* ------------------------------------------------------------------------
     12. Toolbar keyboard navigation (WAI-ARIA toolbar pattern, roving tabindex)
     Applies to every element with role="toolbar", currently the accessibility
     bar. The toolbar is ONE stop in the Tab order:

       Tab / Shift+Tab   enter or leave the toolbar; focus lands on the item
                         used last (tabindex="0"), all others are tabindex="-1"
       Left / Right      previous / next item, mirrored automatically in RTL
       Home / End        first / last item
       Up / Down         used instead of Left / Right when the toolbar has
                         aria-orientation="vertical"

     Enter and Space keep their normal button behaviour, and no existing click
     handler or ARIA state (aria-pressed, aria-label, aria-disabled) is touched.
     ------------------------------------------------------------------------ */
  const Toolbars = (() => {
    const ITEM = 'button';   // controls that take part in the roving tabindex
    const WRAP = true;       // true: past the last item comes the first (and back); false: stop at the ends

    const create = (toolbar) => {
      let active = null;     // the single item that has tabindex="0"

      /**
       * Items arrow keys can reach. Natively disabled or hidden buttons cannot
       * take focus, so they are skipped. aria-disabled buttons stay in: they
       * remain focusable on purpose (see setAriaDisabled).
       */
      const items = () =>
        Array.from(toolbar.querySelectorAll(ITEM)).filter((item) => !item.disabled && isVisible(item));

      /** Make exactly one item reachable with Tab. */
      const setActive = (item) => {
        active = item;
        toolbar.querySelectorAll(ITEM).forEach((control) => {
          control.tabIndex = control === item ? 0 : -1;
        });
      };

      /**
       * Re-establish the invariant "one tab stop, and it is usable". Runs at start
       * and whenever items change, so the toolbar can never become unreachable
       * (for example when the active button is disabled or hidden).
       */
      const sync = () => {
        const list = items();
        if (list.length === 0) {
          active = null;
          return;
        }
        setActive(list.includes(active) ? active : list[0]);
      };

      const itemOf = (node) => {
        const item = node && node.closest ? node.closest(ITEM) : null;
        return item && toolbar.contains(item) ? item : null;
      };

      const onKeyDown = (event) => {
        // Leave browser and assistive-technology shortcuts alone (for example Alt+Left = back)
        if (event.defaultPrevented || event.isComposing) return;
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

        const list = items();
        const current = itemOf(event.target);
        const index = current ? list.indexOf(current) : -1;
        if (index === -1) return;   // the key was pressed in something that is not a toolbar item

        // In a horizontal RTL toolbar the first item sits on the RIGHT, so the
        // Right arrow goes to the previous item and the Left arrow to the next one.
        const vertical = toolbar.getAttribute('aria-orientation') === 'vertical';
        const rtl = window.getComputedStyle(toolbar).direction === 'rtl';
        const nextKey = vertical ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight';
        const prevKey = vertical ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';

        let target;
        if (event.key === nextKey) target = index + 1;
        else if (event.key === prevKey) target = index - 1;
        else if (event.key === 'Home') target = 0;
        else if (event.key === 'End') target = list.length - 1;
        else return;

        target = WRAP
          ? (target + list.length) % list.length
          : clamp(target, 0, list.length - 1);

        event.preventDefault();      // no page scrolling while moving through the toolbar
        list[target].focus();        // focusin below moves the tab stop with it
      };

      // Whatever receives focus becomes the tab stop: this is the "roving" part
      toolbar.addEventListener('focusin', (event) => {
        const item = itemOf(event.target);
        if (item) setActive(item);
      });

      // Safari does not focus a button when it is clicked, so remember it here too
      toolbar.addEventListener('click', (event) => {
        const item = itemOf(event.target);
        if (item && !item.disabled) setActive(item);
      });

      toolbar.addEventListener('keydown', onKeyDown);

      // Buttons added, removed, disabled or hidden by script
      if (typeof window.MutationObserver === 'function') {
        new window.MutationObserver(sync).observe(toolbar, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['disabled', 'hidden'],   // not tabindex: our own writes must not retrigger sync
        });
      }

      // Items hidden or shown by CSS (breakpoints) change without any DOM mutation
      let frame = 0;
      window.addEventListener('resize', () => {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(sync);
      });

      sync();
    };

    const bind = () => {
      document.querySelectorAll('[role="toolbar"]').forEach(create);
    };

    return { bind };
  })();

  /* ------------------------------------------------------------------------
     13. Booking form (inside #booking-modal)
     Validates, shows an error summary that takes focus, then confirms.
     With CONFIG.booking.endpoint set it POSTs JSON and handles failures;
     with null it runs in demo mode and sends nothing.
     ------------------------------------------------------------------------ */
  const Booking = (() => {
    const el = {};
    let tried = false;     // after the first failed submit, fields re-validate as the user types
    let busy = false;

    const pad = (n) => String(n).padStart(2, '0');
    const todayIso = () => {
      const now = new Date();
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    };

    const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
    const isPhone = (value) => /^\+?\d{8,15}$/.test(normalizeText(value).replace(/[\s\-().]/g, ''));

    const FIELDS = Object.freeze([
      { id: 'bk-name', check: (v) => (v.trim().length >= 2 ? '' : MSG.errName) },
      { id: 'bk-contact', check: (v) => (isEmail(v) || isPhone(v) ? '' : MSG.errContact) },
      { id: 'bk-type', check: (v) => (v ? '' : MSG.errType) },
      { id: 'bk-date', check: (v) => (!v || v >= todayIso() ? '' : MSG.errDate) },
      { id: 'bk-consent', check: (v, input) => (input.checked ? '' : MSG.errConsent) },
    ]);

    /** Show or clear one field's error, keeping its other aria-describedby ids. */
    const setError = (id, message) => {
      const input = $(id);
      const errorEl = $(`${id}-err`);
      if (!input) return;
      const errorId = `${id}-err`;
      const rest = (input.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter((token) => token && token !== errorId);

      if (message) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', [...rest, errorId].join(' '));
        if (errorEl) { errorEl.textContent = message; errorEl.hidden = false; }
      } else {
        input.removeAttribute('aria-invalid');
        if (rest.length) input.setAttribute('aria-describedby', rest.join(' '));
        else input.removeAttribute('aria-describedby');
        if (errorEl) { errorEl.textContent = ''; errorEl.hidden = true; }
      }
    };

    const validateAll = () => {
      const errors = [];
      FIELDS.forEach((field) => {
        const input = $(field.id);
        const message = input ? field.check(input.value, input) : '';
        setError(field.id, message);
        if (message) errors.push({ id: field.id, message });
      });
      return errors;
    };

    /* ---- error summary ---- */
    const hideSummary = () => {
      el.summary.hidden = true;
      el.summaryList.replaceChildren();
    };

    const showSummary = (errors) => {
      el.summaryTitle.textContent = MSG.errCount(errors.length);
      el.summaryList.replaceChildren(
        ...errors.map(({ id, message }) => {
          const item = document.createElement('li');
          if (id) {
            const link = document.createElement('a');
            link.href = `#${id}`;
            link.textContent = message;
            link.dataset.field = id;     // click moves focus to the field instead of jumping the page
            item.append(link);
          } else {
            item.textContent = message;
          }
          return item;
        })
      );
      el.summary.hidden = false;
      el.summary.focus();                // role="alert" + focus: announced once, and the user is placed on it
    };

    const onSummaryClick = (event) => {
      const link = event.target.closest && event.target.closest('a[data-field]');
      if (!link) return;
      event.preventDefault();
      const input = $(link.dataset.field);
      if (input) input.focus();
    };

    /** After a failed submit, fix errors live: a valid field drops out of the summary. */
    const revalidate = (event) => {
      if (!tried) return;
      const field = FIELDS.find((item) => item.id === event.target.id);
      if (!field || event.target.getAttribute('aria-invalid') !== 'true') return;

      const message = field.check(event.target.value, event.target);
      setError(field.id, message);
      if (message) return;
      const link = el.summaryList.querySelector(`a[data-field="${field.id}"]`);
      if (link) link.parentElement.remove();
      const left = el.summaryList.children.length;
      if (left === 0) hideSummary();
      else el.summaryTitle.textContent = MSG.errCount(left);
    };

    /* ---- submit ---- */
    const collect = () => {
      const data = Object.fromEntries(new window.FormData(el.form).entries());
      data.consent = Boolean($('bk-consent') && $('bk-consent').checked);
      return data;
    };

    const post = async (payload) => {
      if (!CONFIG.booking.endpoint) return;              // demo mode: nothing leaves the page
      const controller = new window.AbortController();
      const timer = window.setTimeout(() => controller.abort(), CONFIG.booking.timeout);
      try {
        const response = await window.fetch(CONFIG.booking.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } finally {
        window.clearTimeout(timer);
      }
    };

    const setBusy = (value) => {
      busy = value;
      el.form.setAttribute('aria-busy', String(value));
      // aria-disabled, not disabled: focus must stay on the button
      el.submit.setAttribute('aria-disabled', String(value));
    };

    const showSuccess = () => {
      hideSummary();
      el.form.hidden = true;
      el.success.hidden = false;
      el.successTitle.focus();
    };

    const onSubmit = async (event) => {
      event.preventDefault();
      if (busy) return;

      tried = true;
      const errors = validateAll();
      if (errors.length) {
        showSummary(errors);
        return;
      }
      hideSummary();
      setBusy(true);
      try {
        const payload = collect();
        await post(payload);
        el.form.dispatchEvent(new CustomEvent('booking:sent', { bubbles: true, detail: payload }));
        showSuccess();
      } catch (error) {
        console.error('[AuraAccess] booking request failed:', error && error.name);
        showSummary([{ id: null, message: MSG.errSend }]);
      } finally {
        setBusy(false);
      }
    };

    /* ---- dialog lifecycle ---- */
    const onBeforeOpen = (event) => {
      const trigger = event.detail && event.detail.trigger;
      const context = trigger && trigger.getAttribute ? trigger.getAttribute('data-context') : '';
      const dialog = el.modal.querySelector('[role="dialog"]');

      if (context) {
        el.context.textContent = MSG.context(context);
        el.context.hidden = false;
      } else {
        el.context.textContent = '';
        el.context.hidden = true;
      }
      // The dialog description includes the context sentence only when there is one
      if (dialog) dialog.setAttribute('aria-describedby', context ? 'booking-desc booking-context' : 'booking-desc');
      if (el.date) el.date.min = todayIso();
    };

    const reset = () => {
      el.form.reset();
      FIELDS.forEach((field) => setError(field.id, ''));
      hideSummary();
      el.form.hidden = false;
      el.success.hidden = true;
      setBusy(false);
      tried = false;
    };

    const bind = () => {
      el.modal = $('booking-modal');
      el.form = $('booking-form');
      el.summary = $('booking-errors');
      el.summaryTitle = $('booking-errors-title');
      el.summaryList = $('booking-errors-list');
      el.success = $('booking-success');
      el.successTitle = $('booking-success-title');
      el.context = $('booking-context');
      el.date = $('bk-date');
      el.submit = el.form && el.form.querySelector('[type="submit"]');

      if (!el.modal || !el.form || !el.summary || !el.summaryList || !el.success || !el.context || !el.submit) {
        console.warn('[AuraAccess] booking dialog markup incomplete; form handling skipped');
        return;
      }
      el.form.addEventListener('submit', onSubmit);
      el.form.addEventListener('input', revalidate);
      el.form.addEventListener('change', revalidate);
      el.summary.addEventListener('click', onSummaryClick);
      el.modal.addEventListener('modal:beforeopen', onBeforeOpen);
      el.modal.addEventListener('modal:close', reset);
    };

    return { bind };
  })();

  /* ------------------------------------------------------------------------
     14. Live filtering
     Works on any <form data-filter-form="name"> that points at its list with
     data-filter-list, and optionally at a counter and an empty-state message
     (data-filter-count, data-filter-empty). Controls declare their group with
     data-filter-group; list items carry the matching data attributes.

       group        control                    item attribute      rule
       category     chip buttons (one at a     data-category       equals
                    time, plus "All")
       place-type   checkboxes                 data-place-type     ANY selected
       access       checkboxes / chips         data-access         ALL selected
       city         chip buttons (one at a     data-city           equals, or the
                    time, plus "All")                              item says "all"
       keyword      search input               text + data-keywords every word

     Different groups combine with AND. The list changes instantly; the result
     is spoken through the screen-reader-only region, not the toast.
     ------------------------------------------------------------------------ */
  const Filters = (() => {
    const GROUPS = Object.freeze({
      category: { attr: 'category', all: false },
      'place-type': { attr: 'placeType', all: false },
      access: { attr: 'access', all: true },
      // An item whose source names no city carries "all" and shows under every city
      city: { attr: 'city', all: false, wildcard: 'all' },
    });

    const NOUNS = Object.freeze({
      opportunities: { one: 'فرصة واحدة', two: 'فرصتان', few: 'فرص', many: 'فرصة', none: 'لا توجد فرص مطابقة' },
      directory: { one: 'مكان واحد', two: 'مكانان', few: 'أماكن', many: 'مكانًا', none: 'لا توجد أماكن مطابقة' },
      fallback: { one: 'نتيجة واحدة', two: 'نتيجتان', few: 'نتائج', many: 'نتيجة', none: 'لا توجد نتائج مطابقة' },
    });

    const tokens = (value) => String(value || '').split(/\s+/).filter(Boolean);
    const textCache = new WeakMap();   // normalized search text per item
    const instances = [];

    const create = (form) => {
      const list = $(form.dataset.filterList);
      if (!list) {
        console.warn(`[AuraAccess] filter list "${form.dataset.filterList}" not found`);
        return null;
      }
      const countEl = $(form.dataset.filterCount);
      const emptyEl = $(form.dataset.filterEmpty);
      const nouns = NOUNS[form.dataset.filterForm] || NOUNS.fallback;
      let announceTimer = 0;

      const controls = () => Array.from(form.querySelectorAll('[data-filter-group]'));
      const items = () => Array.from(list.children).filter((node) => node.nodeType === Node.ELEMENT_NODE);
      const chips = (group) =>
        controls().filter((c) => c.tagName === 'BUTTON' && c.dataset.filterGroup === group);

      const labelOf = (control) => {
        const source = control.tagName === 'BUTTON' ? control : control.closest('label') || control;
        return source.textContent.replace(/\s+/g, ' ').trim();
      };

      /** Read the criteria straight from the controls: the DOM is the single source of truth. */
      const read = () => {
        const criteria = { groups: {}, keyword: '', labels: [] };
        controls().forEach((control) => {
          const group = control.dataset.filterGroup;

          if (group === 'keyword') {
            const raw = String(control.value || '').trim();
            criteria.keyword = normalizeText(raw);
            if (raw) criteria.labels.push(`${MSG.filterSearch} «${raw}»`);
            return;
          }
          const isChip = control.tagName === 'BUTTON';
          const active = isChip
            ? control.getAttribute('aria-pressed') === 'true' && control.dataset.filterValue !== 'all'
            : control.checked;
          if (!active) return;

          (criteria.groups[group] = criteria.groups[group] || []).push(isChip ? control.dataset.filterValue : control.value);
          criteria.labels.push(labelOf(control));
        });
        return criteria;
      };

      const matches = (item, criteria) => {
        for (const [group, values] of Object.entries(criteria.groups)) {
          const rule = GROUPS[group];
          if (!rule) continue;                                   // unknown group: ignored, never hides everything
          const have = tokens(item.dataset[rule.attr]);
          const has = (v) => have.includes(v) || Boolean(rule.wildcard && have.includes(rule.wildcard));
          const ok = rule.all ? values.every(has) : values.some(has);
          if (!ok) return false;
        }
        if (criteria.keyword) {
          let text = textCache.get(item);
          if (text === undefined) {
            text = normalizeText(`${item.dataset.keywords || ''} ${item.textContent}`);
            textCache.set(item, text);
          }
          if (!criteria.keyword.split(' ').every((word) => text.includes(word))) return false;
        }
        return true;
      };

      const countText = (shown, total) => {
        if (shown === 0) return nouns.none;
        const phrase = countPhrase(shown, nouns);
        return shown === total ? `يعرض ${phrase}` : `يعرض ${phrase} من أصل ${total}`;
      };

      /** Apply the filter; returns the sentence a screen reader should hear. */
      const apply = () => {
        const criteria = read();
        const all = items();
        let shown = 0;
        all.forEach((item) => {
          const visible = matches(item, criteria);
          item.hidden = !visible;           // hidden = out of layout AND out of the accessibility tree
          if (visible) shown += 1;
        });

        const text = countText(shown, all.length);
        if (countEl) countEl.textContent = text;
        if (emptyEl) emptyEl.hidden = shown > 0;
        list.hidden = shown === 0;

        if (shown === 0) return `${text}. ${MSG.filterEmptyHint}`;
        if (criteria.labels.length) return `${text}. ${MSG.filterActive(criteria.labels.join('، '))}`;
        return `${text}.`;
      };

      /** Apply now, speak after a pause (the latest state wins). */
      const run = (delay, prefix) => {
        const message = apply();
        window.clearTimeout(announceTimer);
        announceTimer = window.setTimeout(() => {
          Announcer.sr(prefix ? `${prefix} ${apply()}` : message);
        }, delay);
      };

      const selectChip = (chip) => {
        const group = chip.dataset.filterGroup;
        const peers = chips(group);
        const all = peers.find((p) => p.dataset.filterValue === 'all');
        // Pressing the active chip again goes back to "All"
        const target = chip.getAttribute('aria-pressed') === 'true' && chip !== all && all ? all : chip;
        peers.forEach((peer) => peer.setAttribute('aria-pressed', String(peer === target)));
      };

      form.addEventListener('click', (event) => {
        const chip = event.target.closest && event.target.closest('button[data-filter-group]');
        if (!chip || !form.contains(chip)) return;
        selectChip(chip);
        run(CONFIG.filter.announceDelay);
      });

      form.addEventListener('change', (event) => {
        if (event.target.matches('input[data-filter-group]')) run(CONFIG.filter.announceDelay);
      });

      form.addEventListener('input', (event) => {
        if (event.target.matches('[data-filter-group="keyword"]')) run(CONFIG.filter.searchDelay);
      });

      // Enter in the search box (or the "apply" button) must never reload the page
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        run(0);
        // Make the outcome visible: bring the result count into view
        const target = countEl && countEl.isConnected ? countEl : list;
        if (target && target.scrollIntoView) {
          const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          target.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
        }
      });

      form.addEventListener('reset', () => {
        // The browser clears checkboxes and text after this event; chips it does not touch
        window.setTimeout(() => {
          // Every chip group goes back to its "All" chip (category, city ...)
          controls().filter((c) => c.tagName === 'BUTTON')
            .forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.filterValue === 'all')));
          run(0, MSG.filterCleared);
        }, 0);
      });

      apply();   // sync with whatever state the browser restored, silently
      return { apply };
    };

    const bind = () => {
      document.querySelectorAll('form[data-filter-form]').forEach((form) => {
        const instance = create(form);
        if (instance) instances.push(instance);
      });
      // Back/forward cache restores form values without re-running scripts
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) instances.forEach((instance) => instance.apply());
      });
    };

    /** Re-run every filter, e.g. after cards were added or removed. */
    const refresh = () => instances.forEach((instance) => instance.apply());

    return { bind, refresh };
  })();

  /* ------------------------------------------------------------------------
     14a. Profile menu (disclosure button + panel of links)
          The button and panel were in the page without any script: this wires them.
          Esc, a click outside, or Tab leaving the panel closes it.
     ------------------------------------------------------------------------ */
  const ProfileMenu = (() => {
    const isOpen = () => ui.profileBtn.getAttribute('aria-expanded') === 'true';
    const set = (open) => {
      ui.profileBtn.setAttribute('aria-expanded', String(open));
      ui.profilePanel.hidden = !open;
    };
    const close = (returnFocus) => {
      if (!isOpen()) return;
      set(false);
      if (returnFocus) ui.profileBtn.focus();
    };
    const bind = () => {
      if (!ui.profileBtn || !ui.profilePanel) return;
      const root = ui.profileBtn.closest('.profile-menu') || ui.profilePanel;
      set(false);
      ui.profileBtn.addEventListener('click', () => set(!isOpen()));
      document.addEventListener('click', (event) => { if (isOpen() && !root.contains(event.target)) close(false); });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !event.defaultPrevented && isOpen()) close(root.contains(document.activeElement));
      });
      root.addEventListener('focusout', (event) => {
        if (isOpen() && event.relatedTarget && !root.contains(event.relatedTarget)) close(false);
      });
      // Choosing an item closes the panel (the router moves focus when the item opens a view)
      ui.profilePanel.addEventListener('click', (event) => { if (event.target.closest && event.target.closest('a')) close(false); });
    };
    return { bind };
  })();

  /* ------------------------------------------------------------------------
     14a2. Voice search (Web Speech API, recognition side)
           Fills the search box of the view you are in (directory, otherwise services) and
           runs the normal filter. Without browser support the button says so when pressed.
     ------------------------------------------------------------------------ */
  const VoiceSearch = (() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    let recognition = null;
    let listening = false;

    const targetInput = () => {
      const view = document.documentElement.dataset.view;
      if (view === 'places') return $('dir-search');
      if (view !== 'opportunities' && window.AuraRouter) window.AuraRouter.show('opportunities', { focus: false, announce: false });
      return $('opp-search');
    };

    const render = () => { if (ui.voice) ui.voice.setAttribute('aria-pressed', String(listening)); };

    const stop = () => { if (recognition) { try { recognition.stop(); } catch (error) { /* already stopped */ } } };

    const start = () => {
      const input = targetInput();
      if (!input) return;
      recognition = new Recognition();
      recognition.lang = `${(document.documentElement.lang || 'ar').split('-')[0]}-EG`;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => { listening = true; render(); Announcer.say(MSG.voiceListening); };
      recognition.onresult = (event) => {
        const text = event.results && event.results[0] && event.results[0][0] ? event.results[0][0].transcript.trim() : '';
        if (!text) { Announcer.say(MSG.voiceNothing); return; }
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));   // the filter engine does the rest
        input.focus();
        Announcer.say(MSG.voiceHeard(text));
      };
      recognition.onerror = (event) => {
        const code = event && event.error;
        if (code === 'not-allowed' || code === 'service-not-allowed') Announcer.say(MSG.voiceDenied);
        else if (code === 'no-speech') Announcer.say(MSG.voiceNothing);
        else if (code !== 'aborted') Announcer.say(MSG.voiceFailed);
      };
      recognition.onend = () => { listening = false; render(); };
      try { recognition.start(); } catch (error) { listening = false; render(); Announcer.say(MSG.voiceFailed); }
    };

    const bind = () => {
      if (!ui.voice) return;
      if (!Recognition) setAriaDisabled(ui.voice, true);
      ui.voice.addEventListener('click', () => {
        if (!Recognition) { Announcer.say(MSG.voiceUnsupported); return; }
        if (listening) stop(); else start();
      });
      render();
    };
    return { bind };
  })();

  /* ------------------------------------------------------------------------
     14b. Settings view (#settings-form)
     The same state as the toolbar, with the same setters: change one and the
     other follows, because every render*() ends in renderSettings().
     Native radios and checkboxes carry the semantics, so there is no ARIA
     here to keep in sync, only the "checked" state.
     ------------------------------------------------------------------------ */
  const renderSettings = () => {
    const form = ui.settingsForm;
    if (!form) return;
    const check = (name, value) => {
      form.querySelectorAll(`input[type="radio"][name="${name}"]`).forEach((radio) => { radio.checked = radio.value === value; });
    };
    const pct = Math.round(state.fontScale * 100);
    const preset = [1, 1.2, 1.5, 2].includes(state.fontScale);

    check('set-font', String(state.fontScale));              // a size between the presets leaves all four unchecked
    check('set-contrast', state.highContrast ? 'high' : 'standard');
    check('set-theme', state.theme || 'system');
    check('set-rate', String(state.ttsRate));
    if (ui.setDyslexia) ui.setDyslexia.checked = state.dyslexia;
    if (ui.setSpeech) {
      ui.setSpeech.checked = state.speech;
      ui.setSpeech.setAttribute('aria-disabled', String(!Speech.supported));
    }
    if (ui.setFontStatus) {
      ui.setFontStatus.textContent = `الحجم الحالي: ${pct}%.${preset ? '' : ' (حجم مخصص من شريط الأدوات)'} الحجم الصغير هو حجم الخط في متصفحك، ولا نصغّره عنه.`;
    }
  };

  const bindSettings = () => {
    const form = ui.settingsForm;
    if (!form) return;
    form.addEventListener('change', (event) => {
      const input = event.target;
      switch (input.name) {
        case 'set-font': setFontScale(input.value); break;
        case 'set-contrast': setContrast(input.value === 'high'); break;
        case 'set-theme': setTheme(input.value === 'system' ? null : input.value); break;
        case 'set-dyslexia': setDyslexia(input.checked); break;
        case 'set-speech': setSpeech(input.checked); break;
        case 'set-rate': setRate(input.value); break;
        default: return;
      }
      renderSettings();   // puts back any control whose change was refused (speech on an unsupported browser)
    });
    // Enter inside the form must never reload the page
    form.addEventListener('submit', (event) => event.preventDefault());
    on(ui.setPreview, 'click', previewVoice);
    on(ui.setReset, 'click', resetAll);
  };

  /* ------------------------------------------------------------------------
     15. Reset and cross-tab sync
     ------------------------------------------------------------------------ */
  const resetAll = () => {
    Store.clear();                       // forget saved choices; OS preference applies again
    state.fontScale = DEFAULTS.fontScale;
    state.highContrast = defaultContrast();
    state.dyslexia = DEFAULTS.dyslexia;
    state.theme = DEFAULTS.theme;
    state.ttsRate = DEFAULTS.ttsRate;
    state.speech = false;
    Speech.disable();
    renderFont();
    renderContrast();
    renderDyslexia();
    renderTheme();
    renderSpeech();
    Announcer.say(MSG.resetDone);
  };

  /** Another tab changed the preferences: follow it silently. */
  const onStorage = (event) => {
    if (event.key !== null && event.key !== CONFIG.storageKey) return;
    loadPrefs();
    renderFont();
    renderContrast();
    renderDyslexia();
    renderTheme();
  };

  /* ------------------------------------------------------------------------
     16. Start-up
     ------------------------------------------------------------------------ */
  const on = (element, type, handler) => {
    if (element) element.addEventListener(type, handler);
  };

  const init = () => {
    cacheDom();
    loadPrefs();

    // The CSS reads the scale from a custom property; show the real state first
    renderFont();
    renderContrast();
    renderDyslexia();
    renderTheme();
    renderSpeech();

    // <output> is an implicit live region; the toast already announces changes
    if (ui.fontOut) ui.fontOut.setAttribute('aria-live', 'off');

    // Unsupported browsers keep a focusable button that explains itself when pressed
    if (!Speech.supported) setAriaDisabled(ui.speech, true);

    on(ui.fontDec, 'click', () => changeFont(-1));
    on(ui.fontInc, 'click', () => changeFont(1));
    on(ui.contrast, 'click', toggleContrast);
    on(ui.dyslexia, 'click', toggleDyslexia);
    on(ui.theme, 'click', toggleTheme);
    // While following the OS, keep the button in step when the system theme changes
    if (systemDark) {
      const follow = () => { if (!state.theme) renderTheme(); };
      if (systemDark.addEventListener) systemDark.addEventListener('change', follow);
      else if (systemDark.addListener) systemDark.addListener(follow);
    }
    on(ui.speech, 'click', toggleSpeech);
    on(ui.reset, 'click', resetAll);
    window.addEventListener('storage', onStorage);

    Announcer.bind();
    Speech.bind();
    Modals.bind();
    Nav.bind();
    Toolbars.bind();
    Booking.bind();
    Filters.bind();
    ProfileMenu.bind();
    VoiceSearch.bind();
    bindSettings();
    renderSettings();
  };

  // Public surface for the modules that come next
  window.AuraAccess = Object.freeze({
    version: '0.8.0',
    announce: (message) => Announcer.say(message),        // visible toast + spoken
    announceSilently: (message) => Announcer.sr(message), // spoken only
    stopSpeaking: () => Speech.stop(),
    openModal: (id, trigger) => Modals.open(id, trigger),
    closeModal: (id) => Modals.close(id),
    refreshFilters: () => Filters.refresh(),               // call after adding or removing cards
  });

  const start = () => {
    try {
      init();
    } catch (error) {
      // The page must stay usable even if the toolbar fails to start
      console.error('[AuraAccess] toolbar failed to start:', error);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
