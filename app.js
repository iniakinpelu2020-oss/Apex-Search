/**
 * Apex Search - a thin, offline-first client for a self-hosted SearXNG.
 *
 * Everything in this file is local: the only network requests are the results
 * iframe and the shell assets. No analytics, no cookies, no remote fonts.
 */
(function () {
  'use strict';

  var DEFAULT_INSTANCE = 'https://searxng-6mmb.onrender.com/search?q=%s';
  var HISTORY_LIMIT = 40;
  var SUGGESTION_LIMIT = 7;
  var FRAME_TIMEOUT = 9000;

  var KEYS = {
    history: 'apex-search:history',
    instance: 'apex-search:instance',
    category: 'apex-search:category'
  };

  var CATEGORIES = {
    general: 'All',
    images: 'Images',
    it: 'IT / Code',
    news: 'News'
  };

  /* Local suggestions. Nothing here is fetched: a suggestion is only a query
     the user could type, never a request to a suggestion service. */
  var QUICK = [
    'searxng self hosted setup',
    'javascript fetch with timeout',
    'css grid vs flexbox',
    'privacy focused browsers',
    'kotlin coroutines flow',
    'open source icon sets',
    'what is a service worker',
    'python virtualenv cheat sheet'
  ];

  var state = {
    query: '',
    category: 'general',
    suggestions: [],
    activeSuggestion: -1,
    lastFocus: null
  };

  var frameLoaded = false;
  var frameTimer = 0;

  /* ---------- elements ---------- */

  var $ = function (id) { return document.getElementById(id); };

  var els = {
    form: $('searchForm'),
    input: $('query'),
    clear: $('clearBtn'),
    suggestions: $('suggestions'),
    cats: $('cats'),
    welcome: $('welcome'),
    results: $('results'),
    resultsLabel: $('resultsLabel'),
    frame: $('resultsFrame'),
    fallback: $('frameFallback'),
    fallbackOpen: $('fallbackOpen'),
    fallbackSettings: $('fallbackSettings'),
    openExternal: $('openExternal'),
    historyBtn: $('historyBtn'),
    settingsBtn: $('settingsBtn'),
    historySheet: $('historySheet'),
    settingsSheet: $('settingsSheet'),
    historyList: $('historyList'),
    historyEmpty: $('historyEmpty'),
    historyClose: $('historyClose'),
    settingsClose: $('settingsClose'),
    clearHistory: $('clearHistory'),
    settingsForm: $('settingsForm'),
    instanceInput: $('instanceInput'),
    resetInstance: $('resetInstance'),
    scrim: $('scrim'),
    toast: $('toast'),
    instanceLabel: $('instanceLabel'),
    factInstance: $('factInstance'),
    factHistory: $('factHistory'),
    offlineNote: $('offlineNote'),
    chips: $('chips')
  };

  /* ---------- storage (private mode friendly) ---------- */

  var storage = {
    get: function (key, fallback) {
      try {
        var value = localStorage.getItem(key);
        return value === null ? fallback : value;
      } catch (error) {
        return fallback;
      }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, value); } catch (error) { /* full or blocked */ }
    },
    remove: function (key) {
      try { localStorage.removeItem(key); } catch (error) { /* blocked */ }
    }
  };

  function readHistory() {
    var raw;
    try {
      raw = JSON.parse(storage.get(KEYS.history, '[]'));
    } catch (error) {
      return [];
    }
    if (!Array.isArray(raw)) return [];

    return raw
      .filter(function (entry) {
        return entry && typeof entry.q === 'string' && entry.q.trim() !== '';
      })
      .map(function (entry) {
        return {
          q: entry.q.slice(0, 200),
          cat: CATEGORIES[entry.cat] ? entry.cat : 'general',
          at: typeof entry.at === 'number' ? entry.at : 0
        };
      });
  }

  function writeHistory(entries) {
    storage.set(KEYS.history, JSON.stringify(entries.slice(0, HISTORY_LIMIT)));
  }

  function rememberSearch(query, category) {
    var entries = readHistory().filter(function (entry) {
      return entry.q.toLowerCase() !== query.toLowerCase();
    });
    entries.unshift({ q: query, cat: category, at: Date.now() });
    writeHistory(entries);
  }

  function forgetSearch(query) {
    writeHistory(readHistory().filter(function (entry) { return entry.q !== query; }));
  }

  /* ---------- instance ---------- */

  function instance() {
    var saved = storage.get(KEYS.instance, '');
    return /^https?:\/\/\S+$/i.test(saved) ? saved : DEFAULT_INSTANCE;
  }

  /** Build a SearXNG search URL without trusting any stored characters. */
  function searchUrl(query, category) {
    var base = instance().trim();
    var encoded = encodeURIComponent(query);
    var url;

    if (base.indexOf('%s') !== -1) {
      url = base.split('%s').join(encoded);
    } else {
      url = base + (base.indexOf('?') === -1 ? '?' : '&') + 'q=' + encoded;
    }

    if (category && category !== 'general') {
      url += (url.indexOf('?') === -1 ? '?' : '&') + 'categories=' + encodeURIComponent(category);
    }
    return url;
  }

  function instanceHost() {
    try {
      return new URL(instance().split('%s').join('x')).hostname.replace(/^www\./, '');
    } catch (error) {
      return 'custom instance';
    }
  }

  /* ---------- history rendering ---------- */

  function when(timestamp) {
    if (!timestamp) return '';
    var seconds = Math.round((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.round(seconds / 60) + ' min ago';
    if (seconds < 86400) return Math.round(seconds / 3600) + ' h ago';
    return Math.round(seconds / 86400) + ' d ago';
  }

  function renderHistory() {
    var entries = readHistory();
    els.historyList.textContent = '';
    els.historyEmpty.hidden = entries.length > 0;
    els.factHistory.textContent = entries.length ? entries.length + ' recent' : 'Empty';

    entries.forEach(function (entry) {
      var li = document.createElement('li');

      var run = document.createElement('button');
      run.type = 'button';
      run.className = 'run';
      run.dataset.query = entry.q;
      run.dataset.cat = entry.cat;

      var label = document.createElement('span');
      label.textContent = entry.q;
      var meta = document.createElement('small');
      meta.textContent = CATEGORIES[entry.cat] + (when(entry.at) ? ' · ' + when(entry.at) : '');
      run.append(label, meta);

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove';
      remove.dataset.query = entry.q;
      remove.setAttribute('aria-label', 'Remove "' + entry.q + '" from history');
      remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7 7 17"/></svg>';

      li.append(run, remove);
      els.historyList.append(li);
    });
  }

  /* ---------- suggestions ---------- */

  function suggestionList(term) {
    var lower = term.trim().toLowerCase();
    var seen = Object.create(null);
    var items = [];

    readHistory().forEach(function (entry) {
      if (items.length >= SUGGESTION_LIMIT) return;
      var key = entry.q.toLowerCase();
      if (seen[key]) return;
      if (lower && key.indexOf(lower) === -1) return;
      seen[key] = true;
      items.push({ q: entry.q, tag: 'recent' });
    });

    QUICK.forEach(function (query) {
      if (items.length >= SUGGESTION_LIMIT) return;
      var key = query.toLowerCase();
      if (seen[key]) return;
      if (lower && key.indexOf(lower) === -1) return;
      seen[key] = true;
      items.push({ q: query, tag: 'idea' });
    });

    return items;
  }

  function hideSuggestions() {
    els.suggestions.hidden = true;
    els.suggestions.textContent = '';
    els.input.setAttribute('aria-expanded', 'false');
    state.suggestions = [];
    state.activeSuggestion = -1;
  }

  function showSuggestions() {
    var items = suggestionList(els.input.value);
    state.suggestions = items;
    state.activeSuggestion = -1;
    els.suggestions.textContent = '';

    if (!items.length) {
      hideSuggestions();
      return;
    }

    items.forEach(function (item, index) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.dataset.index = String(index);
      li.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>';

      var text = document.createElement('span');
      text.textContent = item.q;
      var tag = document.createElement('small');
      tag.textContent = item.tag === 'recent' ? 'recent' : 'idea';

      li.append(text, tag);
      els.suggestions.append(li);
    });

    els.suggestions.hidden = false;
    els.input.setAttribute('aria-expanded', 'true');
  }

  function highlightSuggestion(direction) {
    if (!state.suggestions.length) return;
    var total = state.suggestions.length;
    var next = state.activeSuggestion + direction;
    if (next < 0) next = total - 1;
    if (next >= total) next = 0;
    state.activeSuggestion = next;

    Array.prototype.forEach.call(els.suggestions.children, function (node, index) {
      node.setAttribute('aria-selected', index === next ? 'true' : 'false');
    });
  }

  /* ---------- search ---------- */

  function setCategory(category) {
    if (!CATEGORIES[category]) category = 'general';
    state.category = category;
    storage.set(KEYS.category, category);

    Array.prototype.forEach.call(els.cats.children, function (button) {
      var active = button.dataset.cat === category;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function runSearch(raw, category) {
    var query = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!query) {
      els.input.focus();
      return;
    }
    if (navigator.onLine === false) {
      toast('Offline - searches need a connection');
    }

    if (category) setCategory(category);
    state.query = query;
    els.input.value = query;
    els.clear.hidden = false;

    rememberSearch(query, state.category);
    renderHistory();
    hideSuggestions();

    var url = searchUrl(query, state.category);
    showResults(url, query);

    /* The on-screen keyboard is in the way of the results on a phone. */
    els.input.blur();
  }

  function showResults(url, query) {
    els.welcome.hidden = true;
    els.results.hidden = false;
    els.resultsLabel.textContent = '"' + query + '" · ' + CATEGORIES[state.category];
    els.openExternal.href = url;
    els.fallbackOpen.href = url;

    frameLoaded = false;
    els.fallback.hidden = true;
    els.frame.src = url;

    window.clearTimeout(frameTimer);
    frameTimer = window.setTimeout(function () {
      if (!frameLoaded) els.fallback.hidden = false;
    }, FRAME_TIMEOUT);

    document.title = query + ' - Apex Search';

    try {
      history.replaceState(null, '', '#' + new URLSearchParams({ q: query, c: state.category }).toString());
    } catch (error) {
      /* file:// and some embedded contexts refuse the state change. */
    }
  }

  function readHash() {
    var raw = location.hash.replace(/^#/, '');
    if (!raw) return null;

    var params = new URLSearchParams(raw);
    var query = (params.get('q') || '').trim();
    if (!query) return null;

    var category = params.get('c');
    return { q: query, category: CATEGORIES[category] ? category : 'general' };
  }

  /* ---------- panels ---------- */

  function openSheet(sheet, trigger) {
    state.lastFocus = trigger || document.activeElement;
    els.scrim.hidden = false;
    sheet.hidden = false;
    if (trigger) trigger.setAttribute('aria-expanded', 'true');

    var focusable = sheet.querySelector('input, button');
    if (focusable) focusable.focus();
  }

  function closeSheets() {
    [els.historySheet, els.settingsSheet].forEach(function (sheet) {
      sheet.hidden = true;
    });
    els.scrim.hidden = true;
    els.historyBtn.setAttribute('aria-expanded', 'false');
    els.settingsBtn.setAttribute('aria-expanded', 'false');

    if (state.lastFocus && document.contains(state.lastFocus)) {
      state.lastFocus.focus();
    }
    state.lastFocus = null;
  }

  function openHistory() {
    if (!els.settingsSheet.hidden) closeSheets();
    renderHistory();
    openSheet(els.historySheet, els.historyBtn);
  }

  function openSettings() {
    if (!els.historySheet.hidden) closeSheets();
    els.instanceInput.value = instance();
    openSheet(els.settingsSheet, els.settingsBtn);
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(function () { els.toast.hidden = true; }, 2600);
  }

  /* ---------- chips ---------- */

  function renderChips() {
    els.chips.textContent = '';
    QUICK.slice(0, 6).forEach(function (query) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.query = query;
      chip.textContent = query;
      els.chips.append(chip);
    });
  }

  /* ---------- wiring ---------- */

  els.form.addEventListener('submit', function (event) {
    event.preventDefault();
    runSearch(els.input.value);
  });

  els.input.addEventListener('input', function () {
    els.clear.hidden = !els.input.value;
    showSuggestions();
  });

  els.input.addEventListener('focus', function () {
    if (els.input.value.trim()) showSuggestions();
  });

  els.input.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (els.suggestions.hidden) showSuggestions();
      if (!els.suggestions.hidden) {
        event.preventDefault();
        highlightSuggestion(event.key === 'ArrowDown' ? 1 : -1);
      }
      return;
    }

    if (event.key === 'Enter' && state.activeSuggestion >= 0) {
      event.preventDefault();
      var picked = state.suggestions[state.activeSuggestion];
      if (picked) runSearch(picked.q);
      return;
    }

    if (event.key === 'Escape') hideSuggestions();
  });

  els.suggestions.addEventListener('mousedown', function (event) {
    /* mousedown, not click: the input blur would close the list first. */
    var li = event.target.closest('li');
    if (!li) return;
    event.preventDefault();
    var picked = state.suggestions[Number(li.dataset.index)];
    if (picked) runSearch(picked.q);
  });

  els.input.addEventListener('blur', function () {
    window.setTimeout(hideSuggestions, 120);
  });

  els.clear.addEventListener('click', function () {
    els.input.value = '';
    els.clear.hidden = true;
    hideSuggestions();
    els.input.focus();
  });

  els.cats.addEventListener('click', function (event) {
    var button = event.target.closest('.cat');
    if (!button) return;
    setCategory(button.dataset.cat);
    if (state.query) runSearch(state.query, button.dataset.cat);
  });

  els.chips.addEventListener('click', function (event) {
    var chip = event.target.closest('.chip');
    if (chip) runSearch(chip.dataset.query);
  });

  els.frame.addEventListener('load', function () {
    if (els.results.hidden) return;
    frameLoaded = true;
    els.fallback.hidden = true;
    window.clearTimeout(frameTimer);
  });

  els.fallbackSettings.addEventListener('click', function () {
    els.fallback.hidden = true;
    openSettings();
  });

  els.historyBtn.addEventListener('click', openHistory);
  els.settingsBtn.addEventListener('click', openSettings);
  els.historyClose.addEventListener('click', closeSheets);
  els.settingsClose.addEventListener('click', closeSheets);
  els.scrim.addEventListener('click', closeSheets);

  els.historyList.addEventListener('click', function (event) {
    var remove = event.target.closest('.remove');
    if (remove) {
      forgetSearch(remove.dataset.query);
      renderHistory();
      toast('Removed');
      return;
    }

    var run = event.target.closest('.run');
    if (run) {
      closeSheets();
      runSearch(run.dataset.query, run.dataset.cat);
    }
  });

  els.clearHistory.addEventListener('click', function () {
    storage.remove(KEYS.history);
    renderHistory();
    toast('History cleared');
  });

  els.settingsForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var value = els.instanceInput.value.trim();

    if (!/^https?:\/\/\S+$/i.test(value)) {
      toast('Use a full http:// or https:// URL');
      return;
    }
    try {
      new URL(value.split('%s').join('x'));
    } catch (error) {
      toast('That URL does not look right');
      return;
    }

    storage.set(KEYS.instance, value);
    updateInstanceLabels();
    closeSheets();
    toast('Instance saved');
  });

  els.resetInstance.addEventListener('click', function () {
    storage.remove(KEYS.instance);
    els.instanceInput.value = DEFAULT_INSTANCE;
    updateInstanceLabels();
    toast('Back to the default instance');
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (!els.historySheet.hidden || !els.settingsSheet.hidden) {
      closeSheets();
    } else if (!els.suggestions.hidden) {
      hideSuggestions();
    }
  });

  document.addEventListener('click', function (event) {
    if (els.suggestions.hidden) return;
    if (event.target.closest('.searchbar')) return;
    hideSuggestions();
  });

  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);

  function updateConnection() {
    els.offlineNote.hidden = navigator.onLine !== false;
  }

  function updateInstanceLabels() {
    var host = instanceHost();
    els.instanceLabel.textContent = host;
    els.factInstance.textContent = host;
  }

  /* ---------- boot ---------- */

  function boot() {
    setCategory(storage.get(KEYS.category, 'general'));
    updateInstanceLabels();
    updateConnection();
    renderChips();
    renderHistory();
    els.clear.hidden = !els.input.value;

    /* No autofocus: inside an ApexOS app window that would raise the keyboard
       over the landing screen before the user asked to search. */
    var fromHash = readHash();
    if (fromHash) runSearch(fromHash.q, fromHash.category);

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () {
          /* No offline shell in this context; search still works online. */
        });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
