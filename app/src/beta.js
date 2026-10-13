/* Private local backup. Sharing export is deliberately a separate format. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./wardrobe.js'), require('./catalog.js'));
  else root.Beta = factory(root.Wardrobe, root.Catalog);
})(typeof self !== 'undefined' ? self : this, function (W, C) {
  'use strict';
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function cleanTrial(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const date = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s)) ? s.slice(0, 32) : '';
    return { startedAt: date(raw.startedAt), firstCompletedAt: date(raw.firstCompletedAt) };
  }
  function makeBackup(state) {
    const s = clone(state);
    delete s.loadedFrom; delete s._storageRevision;
    return { kind: 'otjang-backup', version: 1, exportedAt: new Date().toISOString(), state: s };
  }
  function readBackup(raw, cleaner) {
    if (!raw || raw.kind !== 'otjang-backup' || raw.version !== 1 || !raw.state || raw.state.schema !== 2) return null;
    const s = clone(raw.state);
    if (!Array.isArray(s.items) || s.items.length > 500 || !Array.isArray(s.decisions) || s.decisions.length > 500 || !Array.isArray(s.others) || s.others.length > 6 || !Array.isArray(s.rack) || s.rack.length > 6 || !s.catalog || !Array.isArray(s.catalog.products) || s.catalog.products.length > 500) return null;
    const n = cleaner(s);
    if (!n || n.items.length !== s.items.length || n.decisions.length !== s.decisions.length || n.others.length !== s.others.length || n.rack.length !== s.rack.length || n.catalog.products.length !== s.catalog.products.length) return null;
    for (let i = 0; i < s.others.length; i++) {
      if (!Array.isArray(s.others[i].items) || s.others[i].items.length > 500 || n.others[i].items.length !== s.others[i].items.length || !Array.isArray(s.others[i].decisions) || n.others[i].decisions.length !== s.others[i].decisions.length) return null;
    }
    // A backup must restore exactly. Invalid pictures or records must not silently disappear.
    const same = (a, b) => {
      if (a === b) return true;
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
      const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
      return ka.length === kb.length && ka.every((k, i) => k === kb[i] && same(a[k], b[k]));
    };
    for (const k of ['meta', 'prefs', 'pickLog', 'betaTrial', 'syncStamp']) if (!(k in s)) s[k] = clone(n[k]);
    const addDecisionFields = (from, to) => from.forEach((d, i) => {
      for (const key of ['follow', 'followup']) if (!(key in d)) d[key] = to[i][key];
    });
    addDecisionFields(s.decisions, n.decisions);
    s.others.forEach((o, i) => addDecisionFields(o.decisions, n.others[i].decisions));
    if (!same(s, n)) return null;
    return n;
  }
  return { makeBackup, readBackup, cleanTrial };
});
