/* Almacenamiento local + fusión por registro (base de la sincronización).
 * Cada registro tiene `updatedAt`; los borrados quedan como "lápidas" (tombstones).
 * `dirty` guarda lo que todavía no se subió a la nube. Al fusionar gana el cambio más reciente. */
(function (root) {
  'use strict';
  const CF = root.CF;
  const KEY = 'combustible_familia_v1';
  const COLS = ['vehicles', 'drivers', 'fills', 'maint', 'expenses'];
  const KIND = { vehicles: 'vehicle', drivers: 'driver', fills: 'fill', maint: 'maint', expenses: 'expense' };
  const COL_OF = {}; Object.keys(KIND).forEach((c) => { COL_OF[KIND[c]] = c; });
  const listeners = [];
  let state;       // se inicializa más abajo, cuando ya están definidos los helpers
  let actor = null;

  function emptyState() {
    return { version: 3, vehicles: [], drivers: [], fills: [], maint: [], expenses: [], tombstones: {}, dirty: {}, settings: { lastVehicleId: null, lastDriverId: null } };
  }

  const isNum = (v) => v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v));
  const numOr = (v, d) => (isNum(v) ? Number(v) : d);
  const str = (v, max) => String(v == null ? '' : v).slice(0, max);
  const idOrNull = (v) => (v ? str(v, 60) : null);

  const cleaners = {
    vehicles(v, ts) {
      if (!v || !v.id || !v.name) return null;
      return { id: str(v.id, 60), name: str(v.name, 60), plate: str(v.plate, 12), model: str(v.model, 60),
        fuel: CF.FUELS[v.fuel] ? v.fuel : 'super', tank: numOr(v.tank, 0), updatedAt: ts(v.updatedAt), createdBy: idOrNull(v.createdBy) };
    },
    drivers(x, ts) {
      if (!x || !x.id || !x.name) return null;
      return { id: str(x.id, 60), name: str(x.name, 60), updatedAt: ts(x.updatedAt), createdBy: idOrNull(x.createdBy) };
    },
    fills(x, ts) {
      if (!x || !x.id || !x.vehicleId || !CF.isISODate(x.date) || !isNum(x.qty) || !(Number(x.qty) > 0) || !isNum(x.total)) return null;
      const qty = Number(x.qty), total = Number(x.total);
      return { id: str(x.id, 60), vehicleId: str(x.vehicleId, 60), driverId: idOrNull(x.driverId), date: x.date,
        fuel: CF.FUELS[x.fuel] ? x.fuel : 'super', qty: qty,
        price: isNum(x.price) && Number(x.price) > 0 ? Number(x.price) : (qty ? total / qty : 0), total: total,
        odo: isNum(x.odo) ? Number(x.odo) : null, full: !!x.full, note: str(x.note, 120),
        payerId: idOrNull(x.payerId), method: CF.PAY_METHODS.indexOf(x.method) >= 0 ? x.method : '',
        createdBy: idOrNull(x.createdBy), createdAt: numOr(x.createdAt, 0), updatedAt: ts(x.updatedAt) };
    },
    maint(x, ts) {
      if (!x || !x.id || !x.vehicleId || !CF.MAINT_TYPES[x.type] || !CF.isISODate(x.date)) return null;
      return { id: str(x.id, 60), vehicleId: str(x.vehicleId, 60), type: x.type, date: x.date,
        odo: isNum(x.odo) ? Number(x.odo) : null, cost: isNum(x.cost) ? Number(x.cost) : null,
        intKm: isNum(x.intKm) ? Number(x.intKm) : null, intMonths: isNum(x.intMonths) ? Number(x.intMonths) : null,
        nextDate: CF.isISODate(x.nextDate) ? x.nextDate : null, nextKm: isNum(x.nextKm) ? Number(x.nextKm) : null,
        payerId: idOrNull(x.payerId), createdBy: idOrNull(x.createdBy),
        note: str(x.note, 160), createdAt: numOr(x.createdAt, 0), updatedAt: ts(x.updatedAt) };
    },
    expenses(x, ts) {
      if (!x || !x.id || !x.vehicleId || !CF.isISODate(x.date) || !isNum(x.amount) || !(Number(x.amount) > 0)) return null;
      return { id: str(x.id, 60), vehicleId: str(x.vehicleId, 60), date: x.date,
        category: CF.EXPENSE_CATEGORIES[x.category] ? x.category : 'otro', amount: Number(x.amount),
        payerId: idOrNull(x.payerId), method: CF.PAY_METHODS.indexOf(x.method) >= 0 ? x.method : '',
        note: str(x.note, 160), createdBy: idOrNull(x.createdBy), createdAt: numOr(x.createdAt, 0), updatedAt: ts(x.updatedAt) };
    }
  };

  function normalizeData(d, fallbackTs) {
    if (!d || typeof d !== 'object' || !Array.isArray(d.vehicles) || !Array.isArray(d.fills)) {
      throw new Error('El archivo no parece un respaldo válido de la app.');
    }
    const ts = (v) => (isNum(v) && Number(v) > 0 ? Number(v) : fallbackTs);
    const out = { tombstones: {} };
    COLS.forEach((c) => {
      out[c] = [];
      (Array.isArray(d[c]) ? d[c] : []).forEach((x) => { const y = cleaners[c](x, ts); if (y) out[c].push(y); });
    });
    if (d.tombstones && typeof d.tombstones === 'object') {
      Object.keys(d.tombstones).forEach((k) => { if (isNum(d.tombstones[k])) out.tombstones[k] = Number(d.tombstones[k]); });
    }
    return out;
  }

  function fixRefs(s) {
    const vids = new Set(s.vehicles.map((v) => v.id));
    const dids = new Set(s.drivers.map((x) => x.id));
    ['fills', 'maint', 'expenses'].forEach((c) => { s[c] = s[c].filter((x) => vids.has(x.vehicleId)); });
    s.fills.forEach((x) => { if (x.driverId && !dids.has(x.driverId)) x.driverId = null; });
    ['fills', 'maint', 'expenses'].forEach((c) => s[c].forEach((x) => { if (x.payerId && !dids.has(x.payerId)) x.payerId = null; }));
  }

  const dataOnly = (s) => ({ vehicles: s.vehicles, drivers: s.drivers, fills: s.fills, maint: s.maint, expenses: s.expenses, tombstones: s.tombstones });

  function canon(d) {
    const o = {};
    COLS.forEach((c) => { o[c] = d[c].slice().sort((a, b) => (a.id < b.id ? -1 : 1)); });
    o.tombstones = Object.keys(d.tombstones).sort().map((k) => [k, d.tombstones[k]]);
    return JSON.stringify(o);
  }

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      const s = Object.assign(emptyState(), normalizeData(parsed, Date.now()));
      s.settings = Object.assign({ lastVehicleId: null, lastDriverId: null }, parsed.settings || {});
      s.dirty = {};
      if (parsed.dirty && typeof parsed.dirty === 'object') {
        Object.keys(parsed.dirty).forEach((k) => { const v = parsed.dirty[k]; if (v && COL_OF[v.kind]) s.dirty[k] = { kind: v.kind, ts: numOr(v.ts, 0) }; });
      }
      fixRefs(s);
      return s;
    } catch (e) {
      console.error('No se pudo leer el almacenamiento local', e);
      try { if (raw) localStorage.setItem(KEY + '_corrupto', raw); } catch (e2) { /* nada */ }
      return emptyState();
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { if (api.onError) api.onError(e); return false; }
  }
  function emit(kind) { listeners.forEach((fn) => { try { fn(kind); } catch (e) { console.error(e); } }); }
  function commit(kind) { save(); emit(kind); }
  const mark = (col, id, ts) => { state.dirty[id] = { kind: KIND[col], ts: ts }; };

  state = load();

  const api = {
    onError: null,
    get: () => state,
    subscribe: (fn) => { listeners.push(fn); },
    setActor(id) { actor = id || null; },

    upsert(col, item) {
      item.updatedAt = Date.now();
      if (!item.createdBy && actor && col !== 'vehicles' && col !== 'drivers') item.createdBy = actor;
      if (!item.createdBy && actor && (col === 'vehicles' || col === 'drivers')) item.createdBy = actor;
      const arr = state[col];
      const i = arr.findIndex((x) => x.id === item.id);
      if (i >= 0) arr[i] = item; else arr.push(item);
      delete state.tombstones[item.id];
      mark(col, item.id, item.updatedAt);
      commit('local');
      return item;
    },

    remove(col, id) {
      const arr = state[col];
      const i = arr.findIndex((x) => x.id === id);
      if (i < 0) return;
      const now = Date.now();
      const kill = (c, x) => { state.tombstones[x.id] = now; mark(c, x.id, now); };
      kill(col, arr[i]);
      arr.splice(i, 1);
      if (col === 'vehicles') {
        ['fills', 'maint', 'expenses'].forEach((c) => {
          state[c] = state[c].filter((x) => { if (x.vehicleId === id) { kill(c, x); return false; } return true; });
        });
        if (state.settings.lastVehicleId === id) state.settings.lastVehicleId = null;
      }
      if (col === 'drivers') {
        ['fills', 'maint', 'expenses'].forEach((c) => state[c].forEach((x) => {
          let ch = false;
          if (x.driverId === id) { x.driverId = null; ch = true; }
          if (x.payerId === id) { x.payerId = null; ch = true; }
          if (ch) { x.updatedAt = now; mark(c, x.id, now); }
        }));
        if (state.settings.lastDriverId === id) state.settings.lastDriverId = null;
      }
      commit('local');
    },

    setSettings(patch) { Object.assign(state.settings, patch); save(); },
    snapshot: () => JSON.parse(JSON.stringify(dataOnly(state))),
    equalsData(raw) { try { return canon(normalizeData(raw, 0)) === canon(dataOnly(state)); } catch (e) { return false; } },

    /* ---- sincronización por registro ---- */
    dirtyRows() {
      const rows = [], sent = {};
      Object.keys(state.dirty).forEach((id) => {
        const d = state.dirty[id], col = COL_OF[d.kind];
        const rec = state[col].find((x) => x.id === id);
        if (rec) rows.push({ kind: d.kind, id: id, data: rec, deleted: false });
        else if (state.tombstones[id]) rows.push({ kind: d.kind, id: id, data: { updatedAt: state.tombstones[id] }, deleted: true });
        else return;
        sent[id] = d.ts;
      });
      return { rows: rows, sent: sent };
    },
    clearDirty(sent) {
      let ch = false;
      Object.keys(sent || {}).forEach((id) => { if (state.dirty[id] && state.dirty[id].ts === sent[id]) { delete state.dirty[id]; ch = true; } });
      if (ch) save();
    },
    markAllDirty() {
      COLS.forEach((c) => state[c].forEach((x) => mark(c, x.id, x.updatedAt)));
      save();
    },
    // Aplica filas bajadas de la nube (gana la más reciente). No las marca como pendientes.
    applyRows(rows) {
      let changed = false;
      const grouped = { vehicles: [], drivers: [], fills: [], maint: [], expenses: [] };
      (rows || []).forEach((r) => {
        const col = COL_OF[r.kind]; if (!col || !r.id) return;
        const ut = numOr(r.data && r.data.updatedAt, 0);
        const local = state[col].find((x) => x.id === r.id);
        const tomb = state.tombstones[r.id] || 0;
        if (r.deleted) {
          if (local && ut >= local.updatedAt) { state[col] = state[col].filter((x) => x.id !== r.id); changed = true; }
          if (ut > tomb && (!local || ut >= local.updatedAt)) { state.tombstones[r.id] = ut; changed = true; }
          return;
        }
        if (tomb >= ut && tomb > 0) return;
        if (local && local.updatedAt >= ut) return;
        const rec = cleaners[col](Object.assign({}, r.data, { id: r.id, createdBy: (r.data && r.data.createdBy) || r.created_by || null }), (v) => (isNum(v) && Number(v) > 0 ? Number(v) : 1));
        if (!rec) return;
        grouped[col].push(rec);
      });
      COLS.forEach((c) => grouped[c].forEach((rec) => {
        const i = state[c].findIndex((x) => x.id === rec.id);
        if (i >= 0) state[c][i] = rec; else state[c].push(rec);
        delete state.tombstones[rec.id];
        delete state.dirty[rec.id];
        changed = true;
      }));
      if (changed) { fixRefs(state); save(); emit('remote'); }
      return changed;
    },
    // Al cambiar de familia en el mismo celular: borra los datos locales.
    wipeLocal() {
      const s = emptyState(); s.settings = state.settings; state = s;
      commit('remote');
    },

    // Fusiona datos externos (respaldo). Lo que se incorpora queda pendiente de subir.
    mergeRemote(raw) {
      const r = normalizeData(raw, Date.now());
      const before = canon(dataOnly(state));
      const tomb = Object.assign({}, state.tombstones);
      Object.keys(r.tombstones).forEach((id) => { if (!(tomb[id] >= r.tombstones[id])) tomb[id] = r.tombstones[id]; });
      COLS.forEach((col) => {
        const map = new Map(state[col].map((x) => [x.id, x]));
        r[col].forEach((x) => {
          const l = map.get(x.id);
          if (!l || x.updatedAt > l.updatedAt) { map.set(x.id, x); mark(col, x.id, x.updatedAt); }
        });
        state[col] = Array.from(map.values()).filter((x) => !(tomb[x.id] >= x.updatedAt));
      });
      state.tombstones = tomb;
      fixRefs(state);
      const changed = canon(dataOnly(state)) !== before;
      if (changed) commit('local');
      return changed;
    },

    exportJSON() {
      const d = dataOnly(state);
      return JSON.stringify({ app: 'app-nafta', version: 3, exportedAt: new Date().toISOString(),
        vehicles: d.vehicles, drivers: d.drivers, fills: d.fills, maint: d.maint, expenses: d.expenses }, null, 2);
    },

    replaceAll(text) {
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { throw new Error('El archivo no es un JSON válido.'); }
      const now = Date.now();
      const n = normalizeData(parsed, now);
      const next = emptyState();
      COLS.forEach((c) => { next[c] = n[c].map((x) => Object.assign({}, x, { updatedAt: now })); });
      fixRefs(next);
      const keep = new Set();
      COLS.forEach((c) => next[c].forEach((x) => keep.add(x.id)));
      const tomb = Object.assign({}, state.tombstones), dirty = Object.assign({}, state.dirty);
      COLS.forEach((c) => state[c].forEach((x) => { if (!keep.has(x.id)) { tomb[x.id] = now; dirty[x.id] = { kind: KIND[c], ts: now }; } }));
      keep.forEach((id) => { delete tomb[id]; });
      COLS.forEach((c) => next[c].forEach((x) => { dirty[x.id] = { kind: KIND[c], ts: now }; }));
      state = Object.assign(next, { tombstones: tomb, dirty: dirty, settings: state.settings });
      commit('local');
      return { vehicles: next.vehicles.length, fills: next.fills.length, maint: next.maint.length, expenses: next.expenses.length };
    },

    importMerge(text) {
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { throw new Error('El archivo no es un JSON válido.'); }
      const c0 = { vehicles: state.vehicles.length, fills: state.fills.length, maint: state.maint.length, expenses: state.expenses.length };
      api.mergeRemote(parsed);
      emit('local');
      return { vehicles: state.vehicles.length - c0.vehicles, fills: state.fills.length - c0.fills,
        maint: state.maint.length - c0.maint, expenses: state.expenses.length - c0.expenses };
    },

    reset() {
      const now = Date.now();
      COLS.forEach((c) => state[c].forEach((x) => { state.tombstones[x.id] = now; mark(c, x.id, now); }));
      COLS.forEach((c) => { state[c] = []; });
      state.settings = { lastVehicleId: null, lastDriverId: null };
      commit('local');
    }
  };

  CF.store = api;
})(window);
