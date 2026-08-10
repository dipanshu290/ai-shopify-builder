/**
 * In-iframe inline editor runtime (AGENTS.md §8, §9).
 *
 * The preview iframe is sandboxed with `allow-scripts` and NO
 * `allow-same-origin`, so the parent app CANNOT read or mutate the iframe DOM.
 * Everything about the inline-editing experience — hover highlighting, the
 * floating toolbar, the editing panels, and the DOM mutations themselves —
 * therefore has to live INSIDE the iframe. It talks to the parent only through
 * postMessage:
 *
 *   parent -> iframe : { type: 'builder:setEditMode', enabled }
 *   iframe -> parent : { type: 'builder:bodyChanged', html }         // after any edit
 *   iframe -> parent : { type: 'builder:requestAIEdit', targetId, prompt }
 *   iframe -> parent : { type: 'builder:requestAIImage', targetId, prompt }
 *
 * Editable units are BOTH whole sections (`data-builder-section-id`) and the
 * granular elements inside them (any element under the cursor — headings,
 * paragraphs, buttons, images, etc.). Whichever element the pointer is over is
 * the edit target, so users can tweak a single heading, not just the section.
 *
 * The floating toolbar is sized for touch, anchored INSIDE the target's top-
 * right corner (so it's always reachable), and can be dragged by its grip.
 *
 * The runtime never touches the sanitize pipeline — the serialized body it
 * posts back is re-sanitized by the parent before storage, so this stays a pure
 * UI layer.
 *
 * Returned as a plain string because the shell is an `srcDoc` document; the
 * code is written without template literals or `${}` so it survives being
 * embedded in a TS template literal untouched.
 */
export function previewEditorScript(): string {
  return `
(function () {
  var SECTION_ATTR = 'data-builder-section-id';
  var ELEMENT_ATTR = 'data-builder-element-id';
  var EDITOR_MARK = 'data-builder-editor';
  var enabled = false;
  var active = null;   // element the toolbar currently points at
  var locked = false;  // true while a panel or inline text edit is open
  var textMode = false;
  var toolbar = null;
  var panel = null;
  var doneBar = null;
  var toolbarMoved = false;  // user dragged the toolbar; stop auto-anchoring
  var dragging = false;
  var dragDX = 0, dragDY = 0;
  var parentWin = window.parent;

  function post(msg) { if (parentWin) parentWin.postMessage(msg, '*'); }

  // ------------------------- ImageKit URL helpers ---------------------------
  // Mirror of lib/images/imagekit.ts, written for the sandboxed iframe. Uses the
  // public delivery endpoint injected as window.__IK_ENDPOINT__ (no secret).
  function ikEndpoint() {
    var e = window.__IK_ENDPOINT__ || '';
    while (e.length && e.charAt(e.length - 1) === '/') e = e.slice(0, -1);
    return e;
  }
  function ikSlug(text) {
    var s = (text || '').toLowerCase(), out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      out += ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) ? c : '-';
    }
    var parts = out.split('-').filter(function (p) { return p; });
    var slug = parts.join('-');
    if (slug.length > 60) slug = slug.slice(0, 60);
    return slug || 'image';
  }
  function ikIsImageKit(url) {
    if (!url) return false;
    var ep = ikEndpoint();
    if (ep && url.indexOf(ep) === 0) return true;
    return url.indexOf('ik.imagekit.io/') > -1 || url.indexOf('/ik-genimg-') > -1;
  }
  function ikBuildGen(prompt, w, h) {
    var ep = ikEndpoint();
    if (!ep) return '';
    var text = (prompt || '').trim() || 'clean modern product photo';
    // Date-based seed varies the path so each generation returns a fresh image
    // (ik-genimg caches per path/filename).
    var file = ikSlug(text) + '-' + Date.now().toString(36) + '.jpg';
    var tr = [];
    if (w) tr.push('w-' + Math.round(w));
    if (h) tr.push('h-' + Math.round(h));
    var q = tr.length ? ('?tr=' + tr.join(',')) : '';
    return ep + '/ik-genimg-prompt-' + encodeURIComponent(text) + '/' + file + q;
  }
  function ikAddTransform(url, token) {
    if (!url || !token) return url;
    var hash = '', h = url.indexOf('#');
    if (h > -1) { hash = url.slice(h); url = url.slice(0, h); }
    var base = url, query = '', q = url.indexOf('?');
    if (q > -1) { base = url.slice(0, q); query = url.slice(q + 1); }
    var params = query ? query.split('&') : [], found = false;
    for (var i = 0; i < params.length; i++) {
      if (params[i].indexOf('tr=') === 0) {
        found = true;
        var ex = params[i].slice(3);
        params[i] = 'tr=' + (ex ? ex + ':' + token : token);
      }
    }
    if (!found) params.push('tr=' + token);
    return base + '?' + params.join('&') + hash;
  }
  function ikB64(text) { return btoa(unescape(encodeURIComponent(text || ''))); }
  function ikPromptToken(effect, prompt) {
    return 'e-' + effect + '-prompte-' + encodeURIComponent(ikB64(prompt));
  }

  // ---- icons (inline SVG so we don't need an icon library in the iframe) ----
  function svg(paths) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" width="19" height="19">' + paths + '</svg>';
  }
  var ICON = {
    grip: svg('<circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/>'),
    text: svg('<path d="M4 7V5h16v2"/><path d="M9 20h6"/><path d="M12 5v15"/>'),
    ai: svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.7 1.8L21 17l-1.3.6L19 19l-.7-1.4L17 17l1.3-.2z"/>'),
    image: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.6"/><path d="M21 15l-5-5L5 21"/>'),
    aiImage: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l5-5 4 4"/><path d="M16 7l.8 2L19 9.8 16.8 10.6 16 13l-.8-2.4L13 9.8 15.2 9z"/>'),
    style: svg('<line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="15" cy="17" r="2"/>'),
    dup: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    up: svg('<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>'),
    down: svg('<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>'),
    del: svg('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/>'),
    close: svg('<path d="M18 6L6 18"/><path d="M6 6l12 12"/>'),
  };

  // ------------------------------ styles ------------------------------------
  function installStyles() {
    if (document.getElementById('__be_style')) return;
    var s = document.createElement('style');
    s.id = '__be_style';
    s.setAttribute(EDITOR_MARK, '');
    s.textContent = [
      '.__be-hover{outline:2px dashed #f9a889 !important;outline-offset:-2px;cursor:default;}',
      '.__be-selected{outline:2px solid #f05a32 !important;outline-offset:-2px;box-shadow:0 0 0 9999px rgba(240,90,50,0.04) inset;}',
      '.__be-edit-text{outline:2px solid #f05a32 !important;outline-offset:-2px;}',
      '.__be-ui{position:absolute;z-index:2147483000;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}',
      '.__be-toolbar{display:flex;align-items:center;gap:3px;padding:6px;background:#1f2937;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.32);}',
      '.__be-toolbar button{all:unset;display:grid;place-items:center;width:40px;height:40px;border-radius:10px;color:#e5e7eb;cursor:pointer;transition:background .12s,color .12s;}',
      '.__be-toolbar button:hover{background:#374151;color:#fff;}',
      '.__be-toolbar button.__be-danger:hover{background:#dc2626;color:#fff;}',
      '.__be-grip{display:grid;place-items:center;width:26px;height:40px;color:#9ca3af;cursor:grab;border-radius:8px;}',
      '.__be-grip:hover{color:#fff;background:#374151;}',
      '.__be-grip:active{cursor:grabbing;}',
      '.__be-sep{width:1px;height:26px;margin:0 3px;background:#374151;}',
      '.__be-panel{width:280px;background:#fff;border:1px solid #ece6e2;border-radius:14px;box-shadow:0 18px 44px rgba(31,41,55,.2);overflow:hidden;color:#111827;}',
      '.__be-panel h4{margin:0;padding:13px 15px;font-size:14px;font-weight:600;border-bottom:1px solid #f0eae6;display:flex;align-items:center;justify-content:space-between;}',
      '.__be-panel .__be-body{padding:13px 15px;display:flex;flex-direction:column;gap:13px;max-height:360px;overflow:auto;}',
      '.__be-row{display:flex;flex-direction:column;gap:6px;}',
      '.__be-row > span{font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.03em;}',
      '.__be-inline{display:flex;align-items:center;gap:8px;}',
      '.__be-panel input[type=text],.__be-panel input[type=number],.__be-panel textarea,.__be-panel select{width:100%;box-sizing:border-box;border:1px solid #e5e0dc;border-radius:8px;padding:8px 10px;font-size:13px;color:#111827;background:#faf8f6;}',
      '.__be-panel textarea{resize:vertical;min-height:70px;}',
      '.__be-panel input[type=color]{width:36px;height:32px;padding:0;border:1px solid #e5e0dc;border-radius:8px;background:#fff;cursor:pointer;}',
      '.__be-panel input[type=range]{width:100%;}',
      '.__be-seg{display:flex;border:1px solid #e5e0dc;border-radius:8px;overflow:hidden;}',
      '.__be-seg button{all:unset;flex:1;text-align:center;padding:7px 0;font-size:12px;color:#6b7280;cursor:pointer;}',
      '.__be-seg button.__be-on{background:#fff3ef;color:#f05a32;font-weight:600;}',
      '.__be-btn{all:unset;box-sizing:border-box;text-align:center;background:#f05a32;color:#fff;font-size:13px;font-weight:600;padding:9px 12px;border-radius:8px;cursor:pointer;}',
      '.__be-btn:hover{background:#e14a24;}',
      '.__be-btn.__be-ghost{background:#f4f0ec;color:#4b5563;}',
      '.__be-btn.__be-ghost:hover{background:#e9e3dd;}',
      '.__be-thumb{width:46px;height:46px;border-radius:8px;object-fit:cover;border:1px solid #e5e0dc;flex-shrink:0;}',
      '.__be-hint{font-size:11px;color:#9aa2af;line-height:1.4;}',
      '.__be-x{all:unset;cursor:pointer;color:#9aa2af;display:grid;place-items:center;width:24px;height:24px;border-radius:6px;}',
      '.__be-x:hover{background:#f4f0ec;color:#4b5563;}',
      '.__be-donebar{display:flex;gap:8px;align-items:center;background:#1f2937;color:#fff;padding:7px 9px 7px 13px;border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.3);font-size:13px;}',
    ].join('');
    document.head.appendChild(s);
  }

  // --------------------------- serialization --------------------------------
  // Produce clean body HTML with all editor artifacts removed, and hand it to
  // the parent, which re-sanitizes and persists it.
  function emitChange() {
    var clone = document.body.cloneNode(true);
    clone.querySelectorAll('[' + EDITOR_MARK + ']').forEach(function (n) { n.remove(); });
    clone.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
    clone.querySelectorAll('.__be-hover,.__be-selected,.__be-edit-text').forEach(function (n) {
      n.classList.remove('__be-hover');
      n.classList.remove('__be-selected');
      n.classList.remove('__be-edit-text');
      if (n.getAttribute('class') === '') n.removeAttribute('class');
    });
    // Strip transient image markers the preview shell adds (loading shimmer /
    // fallback watch) so persisted HTML stays clean.
    clone.querySelectorAll('img').forEach(function (n) {
      n.classList.remove('__ik-ready');
      n.removeAttribute('data-ik-fb');
      if (n.getAttribute('class') === '') n.removeAttribute('class');
    });
    post({ type: 'builder:bodyChanged', html: clone.innerHTML });
  }

  // ---------------------------- target helpers ------------------------------
  function sectionOf(node) {
    var el = node;
    while (el && el !== document.body) {
      if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute(SECTION_ATTR)) return el;
      el = el.parentNode;
    }
    return null;
  }

  function isEditorNode(node) {
    var el = node;
    while (el && el !== document.body) {
      if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute(EDITOR_MARK)) return true;
      el = el.parentNode;
    }
    return false;
  }

  // The element the pointer is over is the edit target — as long as it sits
  // inside a builder section and isn't part of the editor UI. This is what
  // enables editing the inner parts of a section, not just the whole section.
  function pickTarget(node) {
    if (isEditorNode(node)) return null;
    var el = node && node.nodeType === 1 ? node : (node ? node.parentElement : null);
    if (!el || el === document.body || el === document.documentElement) return null;
    if (!sectionOf(el)) return null;
    return el;
  }

  function isSection(el) { return el.nodeType === 1 && el.hasAttribute(SECTION_ATTR); }

  function isImageTarget(el) {
    return el.tagName === 'IMG' || !!el.querySelector('img');
  }

  // Stable id used to target this element for an AI scoped edit.
  function targetIdOf(el) {
    return el.getAttribute(ELEMENT_ATTR) || el.getAttribute(SECTION_ATTR) ||
      (sectionOf(el) ? sectionOf(el).getAttribute(SECTION_ATTR) : '') || '';
  }

  // --------------------------- toolbar geometry -----------------------------
  // Anchor the toolbar just inside the target's top-right corner, so it is
  // always within the visible content and easy to reach.
  function placeToolbar(el) {
    if (!toolbar || toolbarMoved) return;
    var r = el.getBoundingClientRect();
    var tw = toolbar.offsetWidth || 360;
    var left = r.right + window.scrollX - tw - 8;
    var top = r.top + window.scrollY + 8;
    // Keep it on-screen even for tiny or off-top elements.
    var minLeft = window.scrollX + 6;
    var maxLeft = window.scrollX + document.documentElement.clientWidth - tw - 6;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = Math.max(minLeft, maxLeft);
    if (top < window.scrollY + 6) top = window.scrollY + 6;
    toolbar.style.left = left + 'px';
    toolbar.style.top = top + 'px';
  }

  function placeDoneBar() {
    if (!doneBar || !active) return;
    var r = active.getBoundingClientRect();
    doneBar.style.top = Math.max(window.scrollY + 6, r.top + window.scrollY - 48) + 'px';
    doneBar.style.left = Math.max(6, r.left + window.scrollX) + 'px';
  }

  // ------------------------------- dragging ---------------------------------
  function onGripDown(e) {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    var r = toolbar.getBoundingClientRect();
    dragDX = e.clientX - r.left;
    dragDY = e.clientY - r.top;
    document.addEventListener('mousemove', onGripMove, true);
    document.addEventListener('mouseup', onGripUp, true);
  }
  function onGripMove(e) {
    if (!dragging) return;
    toolbarMoved = true;
    toolbar.style.left = (e.clientX - dragDX + window.scrollX) + 'px';
    toolbar.style.top = (e.clientY - dragDY + window.scrollY) + 'px';
  }
  function onGripUp() {
    dragging = false;
    document.removeEventListener('mousemove', onGripMove, true);
    document.removeEventListener('mouseup', onGripUp, true);
  }

  // ----------------------------- toolbar ------------------------------------
  function clearHover() {
    document.querySelectorAll('.__be-hover').forEach(function (n) { n.classList.remove('__be-hover'); });
  }

  function tbButton(icon, title, danger, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    if (danger) b.className = '__be-danger';
    b.innerHTML = icon;
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
    return b;
  }

  function sep() { var d = document.createElement('div'); d.className = '__be-sep'; return d; }

  function buildToolbar(el) {
    toolbar.innerHTML = '';
    var grip = document.createElement('div');
    grip.className = '__be-grip';
    grip.title = 'Drag toolbar';
    grip.innerHTML = ICON.grip;
    grip.addEventListener('mousedown', onGripDown);
    toolbar.appendChild(grip);
    toolbar.appendChild(sep());

    toolbar.appendChild(tbButton(ICON.text, 'Edit text', false, startTextEdit));
    toolbar.appendChild(tbButton(ICON.ai, 'Edit with AI', false, function () { openAIPanel('edit'); }));
    if (isImageTarget(el)) {
      toolbar.appendChild(tbButton(ICON.image, 'Change image', false, openImagePanel));
      toolbar.appendChild(tbButton(ICON.aiImage, 'Generate & transform image (ImageKit)', false, openImageKitPanel));
    }
    toolbar.appendChild(tbButton(ICON.style, 'Edit style', false, openStylePanel));
    toolbar.appendChild(sep());
    toolbar.appendChild(tbButton(ICON.dup, 'Duplicate', false, duplicateEl));
    toolbar.appendChild(tbButton(ICON.up, 'Move up', false, function () { moveEl(-1); }));
    toolbar.appendChild(tbButton(ICON.down, 'Move down', false, function () { moveEl(1); }));
    toolbar.appendChild(sep());
    toolbar.appendChild(tbButton(ICON.del, isSection(el) ? 'Delete section' : 'Delete element', true, deleteEl));
  }

  function showToolbar(el) {
    var changed = el !== active;
    active = el;
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = '__be-ui __be-toolbar';
      toolbar.setAttribute(EDITOR_MARK, '');
      toolbar.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      document.body.appendChild(toolbar);
    }
    if (changed) {
      toolbarMoved = false;
      buildToolbar(el);
    }
    toolbar.style.display = 'flex';
    placeToolbar(el);
  }

  function hideToolbar() {
    if (toolbar) toolbar.style.display = 'none';
    active = null;
  }

  // ---------------------------- selection lock ------------------------------
  function selectTarget(el) {
    locked = true;
    document.querySelectorAll('.__be-selected').forEach(function (n) { n.classList.remove('__be-selected'); });
    clearHover();
    el.classList.add('__be-selected');
    showToolbar(el);
  }

  function unlock() {
    locked = false;
    textMode = false;
    closePanel();
    closeDoneBar();
    document.querySelectorAll('.__be-selected,.__be-edit-text').forEach(function (n) {
      n.classList.remove('__be-selected');
      n.classList.remove('__be-edit-text');
      n.removeAttribute('contenteditable');
    });
    hideToolbar();
  }

  // ------------------------------- panel ------------------------------------
  function closePanel() { if (panel) { panel.remove(); panel = null; } }

  function buildPanel(title) {
    closePanel();
    panel = document.createElement('div');
    panel.className = '__be-ui __be-panel';
    panel.setAttribute(EDITOR_MARK, '');
    panel.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    var head = document.createElement('h4');
    head.innerHTML = '<span>' + title + '</span>';
    var x = document.createElement('button');
    x.className = '__be-x';
    x.innerHTML = ICON.close;
    x.addEventListener('click', function () { unlock(); });
    head.appendChild(x);
    var body = document.createElement('div');
    body.className = '__be-body';
    panel.appendChild(head);
    panel.appendChild(body);
    document.body.appendChild(panel);
    positionPanel();
    return body;
  }

  function positionPanel() {
    if (!panel || !active) return;
    var r = active.getBoundingClientRect();
    var top = r.top + window.scrollY;
    var vw = document.documentElement.clientWidth;
    var left = r.right + window.scrollX + 8;
    if (left + 280 > vw + window.scrollX) left = Math.max(6, r.left + window.scrollX);
    panel.style.top = Math.max(window.scrollY + 6, top) + 'px';
    panel.style.left = left + 'px';
  }

  function row(label, control) {
    var r = document.createElement('div');
    r.className = '__be-row';
    if (label) { var s = document.createElement('span'); s.textContent = label; r.appendChild(s); }
    r.appendChild(control);
    return r;
  }

  // ------------------------------ text edit ---------------------------------
  function startTextEdit() {
    if (!active) return;
    var el = active;
    selectTarget(el);
    textMode = true;
    el.classList.add('__be-edit-text');
    el.setAttribute('contenteditable', 'true');
    el.focus();
    if (toolbar) toolbar.style.display = 'none';
    doneBar = document.createElement('div');
    doneBar.className = '__be-ui __be-donebar';
    doneBar.setAttribute(EDITOR_MARK, '');
    doneBar.innerHTML = '<span>Editing text — click Done when finished</span>';
    var done = document.createElement('button');
    done.className = '__be-btn';
    done.style.padding = '6px 13px';
    done.textContent = 'Done';
    done.addEventListener('click', function () { commitText(); });
    doneBar.appendChild(done);
    document.body.appendChild(doneBar);
    placeDoneBar();
  }

  function commitText() {
    if (!textMode) return;
    textMode = false;
    if (active) {
      active.removeAttribute('contenteditable');
      active.classList.remove('__be-edit-text');
    }
    closeDoneBar();
    emitChange();
    unlock();
  }

  function closeDoneBar() { if (doneBar) { doneBar.remove(); doneBar = null; } }

  // ------------------------------ style edit --------------------------------
  function openStylePanel() {
    if (!active) return;
    var el = active;
    selectTarget(el);
    var body = buildPanel('Edit style');
    var cs = window.getComputedStyle(el);

    function color(label, prop) {
      var input = document.createElement('input');
      input.type = 'color';
      input.value = rgbToHex(cs.getPropertyValue(prop));
      var reset = document.createElement('button');
      reset.className = '__be-btn __be-ghost';
      reset.style.padding = '7px 10px';
      reset.textContent = 'Clear';
      reset.addEventListener('click', function () { el.style.removeProperty(prop); emitChange(); });
      input.addEventListener('input', function () { el.style.setProperty(prop, input.value); emitChange(); });
      var wrap = document.createElement('div'); wrap.className = '__be-inline';
      wrap.appendChild(input); wrap.appendChild(reset);
      return row(label, wrap);
    }

    function slider(label, prop, min, max, unit) {
      var input = document.createElement('input');
      input.type = 'range'; input.min = min; input.max = max;
      input.value = parseInt(cs.getPropertyValue(prop), 10) || min;
      var out = document.createElement('span');
      out.className = '__be-hint';
      out.textContent = input.value + unit;
      input.addEventListener('input', function () {
        out.textContent = input.value + unit;
        el.style.setProperty(prop, input.value + unit);
        emitChange();
      });
      var wrap = document.createElement('div'); wrap.className = '__be-inline';
      wrap.appendChild(input); wrap.appendChild(out);
      return row(label, wrap);
    }

    function align() {
      var seg = document.createElement('div'); seg.className = '__be-seg';
      ['left', 'center', 'right'].forEach(function (v) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = v;
        if (cs.textAlign === v) b.className = '__be-on';
        b.addEventListener('click', function () {
          el.style.textAlign = v;
          seg.querySelectorAll('button').forEach(function (x) { x.className = ''; });
          b.className = '__be-on';
          emitChange();
        });
        seg.appendChild(b);
      });
      return row('Text align', seg);
    }

    function shadow() {
      var selEl = document.createElement('select');
      var opts = [
        ['none', 'None'],
        ['0 1px 2px rgba(0,0,0,.08)', 'Small'],
        ['0 8px 24px rgba(0,0,0,.12)', 'Medium'],
        ['0 20px 45px rgba(0,0,0,.2)', 'Large'],
      ];
      opts.forEach(function (o) { var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; selEl.appendChild(op); });
      selEl.addEventListener('change', function () {
        if (selEl.value === 'none') el.style.removeProperty('box-shadow');
        else el.style.boxShadow = selEl.value;
        emitChange();
      });
      return row('Shadow', selEl);
    }

    body.appendChild(color('Text color', 'color'));
    body.appendChild(color('Background', 'background-color'));
    body.appendChild(slider('Font size', 'font-size', 10, 72, 'px'));
    body.appendChild(align());
    body.appendChild(slider('Padding', 'padding', 0, 120, 'px'));
    body.appendChild(slider('Corner radius', 'border-radius', 0, 60, 'px'));
    body.appendChild(shadow());
  }

  function rgbToHex(v) {
    var m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/.exec(v || '');
    if (!m) return '#000000';
    function h(n) { var s = parseInt(n, 10).toString(16); return s.length === 1 ? '0' + s : s; }
    return '#' + h(m[1]) + h(m[2]) + h(m[3]);
  }

  // ------------------------------ image edit --------------------------------
  function openImagePanel() {
    if (!active) return;
    var el = active;
    selectTarget(el);
    var body = buildPanel('Change image');
    var imgs = el.tagName === 'IMG' ? [el] : Array.prototype.slice.call(el.querySelectorAll('img'));
    if (imgs.length === 0) {
      var none = document.createElement('p');
      none.className = '__be-hint';
      none.textContent = 'No <img> elements here. Use "Edit with AI" to add imagery.';
      body.appendChild(none);
      return;
    }
    imgs.forEach(function (img, i) {
      var wrap = document.createElement('div');
      wrap.className = '__be-row';
      var head = document.createElement('div');
      head.className = '__be-inline';
      var thumb = document.createElement('img');
      thumb.className = '__be-thumb';
      thumb.src = img.currentSrc || img.src;
      var label = document.createElement('span');
      label.className = '__be-hint';
      label.textContent = 'Image ' + (i + 1);
      head.appendChild(thumb); head.appendChild(label);
      wrap.appendChild(head);

      var url = document.createElement('input');
      url.type = 'text';
      url.placeholder = 'Paste image URL';
      url.value = img.getAttribute('src') || '';
      var apply = document.createElement('button');
      apply.className = '__be-btn';
      apply.style.padding = '7px 11px';
      apply.textContent = 'Apply';
      apply.addEventListener('click', function () {
        if (!url.value.trim()) return;
        img.setAttribute('src', url.value.trim());
        thumb.src = url.value.trim();
        emitChange();
      });
      var urlRow = document.createElement('div'); urlRow.className = '__be-inline';
      urlRow.appendChild(url); urlRow.appendChild(apply);
      wrap.appendChild(urlRow);

      var file = document.createElement('input');
      file.type = 'file'; file.accept = 'image/*';
      file.style.fontSize = '12px';
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          img.setAttribute('src', String(reader.result));
          thumb.src = String(reader.result);
          url.value = '';
          emitChange();
        };
        reader.readAsDataURL(f);
      });
      wrap.appendChild(file);
      body.appendChild(wrap);
    });
  }

  // ------------------------------- AI panels --------------------------------
  function openAIPanel(kind) {
    if (!active) return;
    var el = active;
    selectTarget(el);
    var isImage = kind === 'image';
    var body = buildPanel(isImage ? 'Generate / transform image with AI' : 'Edit with AI');
    var ta = document.createElement('textarea');
    ta.placeholder = isImage
      ? 'Describe the image to generate or how to transform it…'
      : 'Describe the change you want for this part…';
    body.appendChild(row('Prompt', ta));
    var hint = document.createElement('p');
    hint.className = '__be-hint';
    hint.textContent = 'The AI updates only this element and applies the change to the live preview.';
    body.appendChild(hint);
    var send = document.createElement('button');
    send.className = '__be-btn';
    send.textContent = isImage ? 'Generate' : 'Apply change';
    send.addEventListener('click', function () {
      var prompt = ta.value.trim();
      if (!prompt) return;
      post({ type: isImage ? 'builder:requestAIImage' : 'builder:requestAIEdit', targetId: targetIdOf(el), prompt: prompt });
      unlock();
    });
    body.appendChild(send);
    setTimeout(function () { ta.focus(); }, 0);
  }

  // --------------------- ImageKit generate / transform ----------------------
  // The action popover for images: generate a brand-new image from a prompt, or
  // apply ImageKit AI transforms (remove bg, upscale, retouch, drop shadow,
  // variation, replace background, AI edit) directly on the delivery URL. These
  // are pure URL operations — instant, no AI round-trip.
  function firstImg(el) {
    return el.tagName === 'IMG' ? el : el.querySelector('img');
  }

  function openImageKitPanel() {
    if (!active) return;
    var el = active;
    selectTarget(el);
    var img = firstImg(el);
    var body = buildPanel('AI image · ImageKit');

    if (!ikEndpoint()) {
      var warn = document.createElement('p');
      warn.className = '__be-hint';
      warn.textContent = 'Set NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT in .env.local to enable AI image generation and transforms.';
      body.appendChild(warn);
      return;
    }
    if (!img) {
      var none = document.createElement('p');
      none.className = '__be-hint';
      none.textContent = 'No image here to work with. Use "Change image" to add one first.';
      body.appendChild(none);
      return;
    }

    function refresh() {
      img.classList.remove('__ik-ready');
      if (window.__ikDecorate) window.__ikDecorate();
      emitChange();
    }
    function applyToken(token) {
      var cur = img.getAttribute('src') || img.src;
      if (!ikIsImageKit(cur)) return;
      img.setAttribute('src', ikAddTransform(cur, token));
      refresh();
    }

    // --- Generate a new image from a prompt ---
    var ta = document.createElement('textarea');
    ta.placeholder = 'Describe the image to generate…';
    ta.value = img.getAttribute('data-ik-prompt') || img.getAttribute('alt') || '';
    body.appendChild(row('Generate a new image', ta));
    var gen = document.createElement('button');
    gen.className = '__be-btn';
    gen.textContent = 'Generate image';
    gen.addEventListener('click', function () {
      var p = ta.value.trim();
      if (!p) return;
      var wAttr = img.getAttribute('width');
      var hAttr = img.getAttribute('height');
      var w = wAttr ? parseInt(wAttr, 10) : (img.clientWidth || 1200);
      var h = hAttr ? parseInt(hAttr, 10) : 0;
      var url = ikBuildGen(p, w, h);
      if (!url) return;
      img.setAttribute('data-ik-prompt', p);
      img.setAttribute('src', url);
      refresh();
      // Rebuild so the AI-transform controls appear now that the image is IK.
      openImageKitPanel();
    });
    body.appendChild(gen);

    var curSrc = img.getAttribute('src') || img.src || '';
    if (!ikIsImageKit(curSrc)) {
      var tip = document.createElement('p');
      tip.className = '__be-hint';
      tip.textContent = 'Generate an image above to unlock AI transforms (remove background, upscale, replace background, and more).';
      body.appendChild(tip);
      setTimeout(function () { ta.focus(); }, 0);
      return;
    }

    // --- One-click AI transforms ---
    var chips = document.createElement('div');
    chips.style.display = 'flex';
    chips.style.flexWrap = 'wrap';
    chips.style.gap = '6px';
    [
      ['Remove background', 'e-bgremove'],
      ['Upscale', 'e-upscale'],
      ['Retouch', 'e-retouch'],
      ['Drop shadow', 'e-dropshadow'],
      ['Variation', 'e-genvar'],
    ].forEach(function (c) {
      var b = document.createElement('button');
      b.className = '__be-btn __be-ghost';
      b.style.padding = '7px 10px';
      b.style.flex = '0 0 auto';
      b.textContent = c[0];
      b.addEventListener('click', function () { applyToken(c[1]); });
      chips.appendChild(b);
    });
    body.appendChild(row('AI transforms', chips));

    // --- Prompt-based transforms ---
    function promptRow(label, effect, ph) {
      var inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = ph;
      var apply = document.createElement('button');
      apply.className = '__be-btn';
      apply.style.padding = '7px 11px';
      apply.textContent = 'Apply';
      apply.addEventListener('click', function () {
        var v = inp.value.trim();
        if (!v) return;
        applyToken(ikPromptToken(effect, v));
        inp.value = '';
      });
      var w = document.createElement('div');
      w.className = '__be-inline';
      w.appendChild(inp); w.appendChild(apply);
      return row(label, w);
    }
    body.appendChild(promptRow('Replace background', 'changebg', 'e.g. on a sunny beach'));
    body.appendChild(promptRow('AI edit', 'edit', 'e.g. make the mug red'));

    var hint = document.createElement('p');
    hint.className = '__be-hint';
    hint.textContent = 'Transforms stack on the current image and update the live preview instantly.';
    body.appendChild(hint);
  }

  // ---------------------------- element actions -----------------------------
  // Re-key any builder ids in a cloned subtree so ids stay unique after a copy.
  function uniquifyIds(root) {
    var nodes = [root].concat(Array.prototype.slice.call(
      root.querySelectorAll('[' + SECTION_ATTR + '],[' + ELEMENT_ATTR + ']')
    ));
    [SECTION_ATTR, ELEMENT_ATTR].forEach(function (attr) {
      nodes.forEach(function (n) {
        if (n.nodeType !== 1 || !n.hasAttribute(attr)) return;
        var base = n.getAttribute(attr);
        var id = base + '-copy', i = 2;
        while (document.querySelector('[' + attr + '="' + id + '"]')) { id = base + '-copy-' + i; i++; }
        n.setAttribute(attr, id);
      });
    });
  }

  function duplicateEl() {
    if (!active) return;
    var el = active;
    var clone = el.cloneNode(true);
    clone.classList.remove('__be-selected', '__be-hover', '__be-edit-text');
    uniquifyIds(clone);
    el.parentNode.insertBefore(clone, el.nextSibling);
    emitChange();
    unlock();
    clone.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function moveEl(dir) {
    if (!active) return;
    var el = active;
    if (dir < 0) {
      var prev = el.previousElementSibling;
      if (prev) el.parentNode.insertBefore(el, prev);
    } else {
      var next = el.nextElementSibling;
      if (next) el.parentNode.insertBefore(next, el);
    }
    emitChange();
    placeToolbar(el);
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function deleteEl() {
    if (!active) return;
    var el = active;
    selectTarget(el);
    var body = buildPanel(isSection(el) ? 'Delete section' : 'Delete element');
    var msg = document.createElement('p');
    msg.className = '__be-hint';
    msg.textContent = 'Remove this ' + (isSection(el) ? 'section' : 'element') + ' from the page? This cannot be undone from here.';
    body.appendChild(msg);
    var buttons = document.createElement('div');
    buttons.className = '__be-inline';
    var cancel = document.createElement('button');
    cancel.className = '__be-btn __be-ghost';
    cancel.style.flex = '1';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function () { unlock(); });
    var confirm = document.createElement('button');
    confirm.className = '__be-btn';
    confirm.style.flex = '1';
    confirm.style.background = '#dc2626';
    confirm.textContent = 'Delete';
    confirm.addEventListener('click', function () {
      el.remove();
      unlock();
      emitChange();
    });
    buttons.appendChild(cancel); buttons.appendChild(confirm);
    body.appendChild(buttons);
  }

  // ------------------------------- listeners --------------------------------
  function onOver(e) {
    if (!enabled || locked || dragging) return;
    var el = pickTarget(e.target);
    if (!el || el === active) return;
    clearHover();
    el.classList.add('__be-hover');
    showToolbar(el);
  }

  function onDocMouseDown(e) {
    if (!enabled || !locked) return;
    if (isEditorNode(e.target)) return;
    if (textMode) {
      if (active && active.contains(e.target)) return; // keep editing text
      commitText();
      return;
    }
    unlock();
  }

  function onScrollResize() {
    if (!enabled) return;
    if (active && toolbar && toolbar.style.display !== 'none') placeToolbar(active);
    if (panel) positionPanel();
    if (doneBar) placeDoneBar();
  }

  function enable() {
    installStyles();
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mousedown', onDocMouseDown, true);
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
  }

  function disable() {
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('mousedown', onDocMouseDown, true);
    window.removeEventListener('scroll', onScrollResize, true);
    window.removeEventListener('resize', onScrollResize);
    unlock();
    clearHover();
  }

  // Public entry: parent toggles edit mode; also re-applied after each setBody
  // (the shell re-invokes this when it swaps the body while edit mode is on).
  window.__builderSetEditMode = function (on) {
    enabled = !!on;
    if (toolbar) { toolbar.remove(); toolbar = null; }
    closePanel();
    closeDoneBar();
    locked = false; textMode = false; active = null; toolbarMoved = false; dragging = false;
    if (enabled) enable();
    else disable();
  };
})();
`;
}
