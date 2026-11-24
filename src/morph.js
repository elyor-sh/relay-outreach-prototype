/**
 * Minimal keyed DOM morphing.
 *
 * Patches an existing DOM tree in place so it matches freshly rendered HTML.
 * Node identity survives re-renders, which keeps focus, caret position,
 * scroll offsets and running CSS transitions intact — the core benefit of a
 * virtual-DOM framework in ~100 lines and zero dependencies.
 *
 * Rules:
 *  - Elements with `data-key` are matched by key (and may move).
 *  - Other nodes are matched by position + tag name.
 *  - A focused <input>/<textarea> never has its value overwritten.
 */
const Morph = (() => {
  'use strict';

  // An inert document: parsed markup never executes scripts or loads resources.
  // All dynamic values are escaped by the view layer (see esc() in app.js).
  const parser = new DOMParser();
  const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-key') : null);

  function morphInto(container, html) {
    const doc = parser.parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
    morphChildren(container, doc.body);
  }

  function morphChildren(from, to) {
    const keyed = new Map();
    for (let c = from.firstChild; c; c = c.nextSibling) {
      const k = keyOf(c);
      if (k != null) keyed.set(k, c);
    }
    let cursor = from.firstChild;
    for (const next of Array.from(to.childNodes)) {
      const k = keyOf(next);
      let match = null;
      if (k != null) {
        const cand = keyed.get(k);
        if (cand && cand.nodeName === next.nodeName) { match = cand; keyed.delete(k); }
      } else if (cursor && keyOf(cursor) == null && cursor.nodeType === next.nodeType && cursor.nodeName === next.nodeName) {
        match = cursor;
      }
      if (match) {
        if (match === cursor) cursor = cursor.nextSibling;
        else from.insertBefore(match, cursor);
        patch(match, next);
      } else {
        from.insertBefore(next, cursor); // adopt the freshly parsed node
      }
    }
    while (cursor) {
      const n = cursor.nextSibling;
      from.removeChild(cursor);
      cursor = n;
    }
  }

  function syncAttributes(a, b) {
    for (let i = a.attributes.length - 1; i >= 0; i--) {
      const name = a.attributes[i].name;
      if (!b.hasAttribute(name)) a.removeAttribute(name);
    }
    for (const at of b.attributes) {
      if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    }
  }

  function patch(a, b) {
    if (a.nodeType === 3 || a.nodeType === 8) {
      if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
      return;
    }
    if (a.nodeType !== 1) return;
    syncAttributes(a, b);
    const focused = document.activeElement === a;
    switch (a.nodeName) {
      case 'INPUT': {
        if (a.type === 'checkbox' || a.type === 'radio') {
          a.checked = b.hasAttribute('checked');
        } else if (!focused) {
          const v = b.getAttribute('value') ?? '';
          if (a.value !== v) a.value = v;
        }
        return;
      }
      case 'TEXTAREA': {
        const v = b.textContent;
        if (!focused && a.value !== v) a.value = v;
        return;
      }
      case 'SELECT': {
        morphChildren(a, b);
        const sel = b.querySelector('option[selected]');
        const v = sel ? sel.getAttribute('value') ?? sel.textContent : (a.options[0] && a.options[0].value);
        if (v != null && a.value !== v) a.value = v;
        return;
      }
      default:
        morphChildren(a, b);
    }
  }

  return { morphInto };
})();
