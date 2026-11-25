/* Cálculos: rendimiento, costo por km, resumen, series para gráficos y alertas */
(function (root) {
  'use strict';
  const CF = root.CF;
  const calc = CF.calc = {};

  const cmp = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
    ((a.odo == null ? -1 : a.odo) - (b.odo == null ? -1 : b.odo)) || ((a.createdAt || 0) - (b.createdAt || 0));

  calc.sortFills = (list) => list.slice().sort(cmp);

  /* Métricas por carga (Map id -> métricas).
   *  - km:         km desde la carga anterior del mismo vehículo
   *  - costKm:     total de esta carga / km desde la anterior
   *  - kmPerUnit / per100: rendimiento "lleno a lleno": km entre dos tanques llenos
   *    dividido por el combustible cargado desde el lleno anterior (inclusive esta carga).
   *    Solo se calcula en cargas marcadas "tanque lleno" y con un lleno previo de referencia.
   */
  calc.computeAll = function (fills) {
    const byV = {};
    fills.forEach((f) => { (byV[f.vehicleId] = byV[f.vehicleId] || []).push(f); });
    const out = new Map();
    Object.keys(byV).forEach((vid) => {
      const list = byV[vid].slice().sort(cmp);
      let prev = null, refOdo = null, acc = 0, unit = null, mixed = false;
      list.forEach((f) => {
        const m = { km: null, costKm: null, segKm: null, segQty: null, kmPerUnit: null, per100: null, unit: CF.unitOf(f.fuel) };
        const fu = CF.unitOf(f.fuel);
        const hasOdo = f.odo != null;
        if (prev && hasOdo) {
          const km = f.odo - prev.odo;
          if (km > 0) { m.km = km; m.costKm = f.total / km; }
        }
        if (refOdo !== null) {
          acc += f.qty;
          if (unit === null) unit = fu; else if (unit !== fu) mixed = true;
          if (f.full) {
            if (hasOdo) {
              const segKm = f.odo - refOdo;
              if (!mixed && segKm > 0 && acc > 0) {
                m.segKm = segKm; m.segQty = acc; m.kmPerUnit = segKm / acc; m.per100 = acc / segKm * 100;
              }
            }
            refOdo = hasOdo ? f.odo : null; acc = 0; unit = null; mixed = false;
          }
        } else if (f.full && hasOdo) {
          refOdo = f.odo; acc = 0; unit = null; mixed = false;
        }
        out.set(f.id, m);
        if (hasOdo) prev = f;
      });
    });
    return out;
  };

  calc.summary = function (rows, map) {
    const s = { count: rows.length, spent: 0, liters: 0, gncM3: 0, totalKm: 0,
      avgKmPerL: null, avgPer100: null, avgKmPerM3: null, avgCostKm: null };
    let spentKm = 0, kmL = 0, qL = 0, kmG = 0, qG = 0;
    rows.forEach((f) => {
      s.spent += f.total;
      if (CF.unitOf(f.fuel) === 'L') s.liters += f.qty; else s.gncM3 += f.qty;
      const m = map.get(f.id);
      if (!m) return;
      if (m.km) { s.totalKm += m.km; spentKm += f.total; }
      if (m.segKm) {
        if (m.unit === 'L') { kmL += m.segKm; qL += m.segQty; } else { kmG += m.segKm; qG += m.segQty; }
      }
    });
    if (qL > 0) { s.avgKmPerL = kmL / qL; s.avgPer100 = qL / kmL * 100; }
    if (qG > 0) s.avgKmPerM3 = kmG / qG;
    if (s.totalKm > 0) s.avgCostKm = spentKm / s.totalKm;
    return s;
  };

  /* ---------- Series para gráficos ---------- */
  const MS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  calc.monthLabel = (key) => MS[Number(key.slice(5, 7)) - 1] + ' ' + key.slice(2, 4);

  // Gasto por mes y por vehículo, últimos `n` meses hasta el último mes con cargas.
  calc.spendByMonth = function (fills, vehicles, n) {
    n = n || 12;
    if (!fills.length) return { months: [], labels: [], series: [] };
    const last = fills.reduce((mx, f) => (f.date.slice(0, 7) > mx ? f.date.slice(0, 7) : mx), '0000-00');
    const months = [];
    let y = Number(last.slice(0, 4)), m = Number(last.slice(5, 7));
    for (let i = 0; i < n; i++) {
      months.unshift(y + '-' + String(m).padStart(2, '0'));
      m--; if (m === 0) { m = 12; y--; }
    }
    const idx = {}; months.forEach((k, i) => { idx[k] = i; });
    const series = [];
    vehicles.forEach((v, vi) => {
      const values = months.map(() => 0);
      let any = false;
      fills.forEach((f) => {
        if (f.vehicleId !== v.id) return;
        const i = idx[f.date.slice(0, 7)];
        if (i !== undefined) { values[i] += (f.amount != null ? f.amount : f.total); any = true; }
      });
      if (any) series.push({ vehicleId: v.id, name: v.name, colorIndex: vi, values: values });
    });
    // recortar meses vacíos al principio
    let first = 0;
    while (first < months.length - 1 && series.every((s) => s.values[first] === 0)) first++;
    return {
      months: months.slice(first), labels: months.slice(first).map(calc.monthLabel),
      series: series.map((s) => Object.assign({}, s, { values: s.values.slice(first) }))
    };
  };

  // Evolución del precio por unidad, una serie por combustible.
  calc.priceSeries = function (fills, vehicleId) {
    const by = {};
    fills.forEach((f) => {
      if (vehicleId && f.vehicleId !== vehicleId) return;
      if (!(f.price > 0)) return;
      const p = f.date.split('-').map(Number);
      (by[f.fuel] = by[f.fuel] || []).push({ t: Date.UTC(p[0], p[1] - 1, p[2]), y: f.price, date: f.date });
    });
    return Object.keys(CF.FUELS).filter((k) => by[k]).map((k) => ({
      fuel: k, points: by[k].sort((a, b) => a.t - b.t)
    }));
  };

  /* ---------- Mantenimiento ---------- */
  calc.DAYS_WARN = 30;
  calc.KM_WARN = 1000;

  // Km actual conocido de un vehículo: el mayor odómetro registrado (cargas o mantenimientos)
  calc.currentKm = function (vehicleId, fills, maint) {
    let mx = null;
    fills.forEach((f) => { if (f.vehicleId === vehicleId && f.odo != null && (mx === null || f.odo > mx)) mx = f.odo; });
    maint.forEach((x) => { if (x.vehicleId === vehicleId && x.odo != null && (mx === null || x.odo > mx)) mx = x.odo; });
    return mx;
  };

  /* Para cada (vehículo, tipo) se toma el último registro y se evalúa su próximo
   * vencimiento por fecha y/o km. Estados: overdue (vencido), soon (próximo), ok. */
  calc.maintAlerts = function (maint, fills, today) {
    const latest = new Map();
    maint.forEach((x) => {
      if (x.nextDate == null && x.nextKm == null) return;
      const key = x.type === 'otro' ? x.id : x.vehicleId + '|' + x.type;
      const l = latest.get(key);
      if (!l || x.date > l.date || (x.date === l.date && (x.updatedAt || 0) > (l.updatedAt || 0))) latest.set(key, x);
    });
    // si el último registro de un tipo no tiene vencimiento, ese tipo no genera alerta
    maint.forEach((x) => {
      if (x.type === 'otro') return;
      const key = x.vehicleId + '|' + x.type;
      const l = latest.get(key);
      if (l && x.date > l.date) latest.delete(key);
    });
    const rank = { overdue: 0, soon: 1, ok: 2 };
    const list = [];
    latest.forEach((x, key) => {
      const km = calc.currentKm(x.vehicleId, fills, maint);
      const daysLeft = x.nextDate ? CF.daysBetween(today, x.nextDate) : null;
      const kmLeft = (x.nextKm != null && km != null) ? x.nextKm - km : null;
      let status = 'ok';
      if ((daysLeft !== null && daysLeft < 0) || (kmLeft !== null && kmLeft <= 0)) status = 'overdue';
      else if ((daysLeft !== null && daysLeft <= calc.DAYS_WARN) || (kmLeft !== null && kmLeft <= calc.KM_WARN)) status = 'soon';
      list.push({ key: key, record: x, status: status, daysLeft: daysLeft, kmLeft: kmLeft, currentKm: km });
    });
    list.sort((a, b) => rank[a.status] - rank[b.status] ||
      (a.daysLeft == null ? 1e9 : a.daysLeft) - (b.daysLeft == null ? 1e9 : b.daysLeft));
    return list;
  };

  /* ---------- Gastos totales (combustible + mantenimiento + otros gastos) ---------- */
  calc.ledger = function (s) {
    const out = [];
    s.fills.forEach((x) => out.push({ id: x.id, type: 'fuel', category: 'combustible', date: x.date, vehicleId: x.vehicleId, payerId: x.payerId || null, amount: x.total }));
    (s.expenses || []).forEach((x) => out.push({ id: x.id, type: 'expense', category: x.category, date: x.date, vehicleId: x.vehicleId, payerId: x.payerId || null, amount: x.amount }));
    s.maint.forEach((x) => { if (x.cost > 0) out.push({ id: x.id, type: 'maint', category: 'mantenimiento', date: x.date, vehicleId: x.vehicleId, payerId: x.payerId || null, amount: x.cost }); });
    return out;
  };
  calc.sum = (list) => list.reduce((a, e) => a + e.amount, 0);

  // Puntos de rendimiento (km/L) por vehículo: una por cada tramo "lleno a lleno" válido
  calc.efficiencySeries = function (fills, map) {
    const out = {};
    fills.forEach((f) => {
      const m = map.get(f.id);
      if (m && m.kmPerUnit && m.unit === 'L') {
        const p = f.date.split('-').map(Number);
        (out[f.vehicleId] = out[f.vehicleId] || []).push({ t: Date.UTC(p[0], p[1] - 1, p[2]), y: m.kmPerUnit, date: f.date });
      }
    });
    Object.keys(out).forEach((k) => out[k].sort((a, b) => a.t - b.t));
    return out;
  };

  // Resumen completo de un vehículo para su ficha
  calc.vehicleStats = function (s, vid, map) {
    map = map || calc.computeAll(s.fills);
    const fills = s.fills.filter((x) => x.vehicleId === vid);
    const sm = calc.summary(fills, map);
    const byCat = {};
    let maintCost = 0, expTotal = 0;
    s.maint.forEach((x) => { if (x.vehicleId === vid && x.cost > 0) maintCost += x.cost; });
    (s.expenses || []).forEach((x) => {
      if (x.vehicleId !== vid) return;
      byCat[x.category] = (byCat[x.category] || 0) + x.amount; expTotal += x.amount;
    });
    return {
      km: calc.currentKm(vid, s.fills, s.maint), summary: sm, fuel: sm.spent, maint: maintCost,
      byCat: byCat, expenses: expTotal, total: sm.spent + maintCost + expTotal, fills: fills.length
    };
  };
})(window);
