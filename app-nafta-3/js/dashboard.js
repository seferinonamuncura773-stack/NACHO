/* Inicio: resumen de la familia (o de un vehículo), próximos vencimientos y últimas cargas */
(function (root) {
  'use strict';
  const CF = root.CF, ui = CF.ui, store = CF.store, calc = CF.calc;
  const { esc, fmtNum, fmtMoney, fmtDate, FUELS, MAINT_TYPES, unitOf } = CF;
  const $ = ui.$;
  const S = () => store.get();
  let sel = '';   // '' = toda la familia

  const money0 = (n) => '$ ' + fmtNum(n, 0);
  function stat(label, value, sub) {
    return '<div class="stat"><div class="label">' + label + '</div><div class="value">' + value + '</div><div class="sub">' + (sub || '&nbsp;') + '</div></div>';
  }

  function render() {
    const s = S();
    if (sel && !s.vehicles.some((v) => v.id === sel)) sel = '';
    $('#seed-card').classList.toggle('hidden', s.vehicles.length > 0);
    // selector de vehículo
    $('#dash-vehicle').innerHTML = s.vehicles.length > 1 || sel
      ? [{ id: '', name: 'Toda la familia' }].concat(s.vehicles).map((v) =>
        '<button type="button" class="chip-btn' + (v.id === sel ? ' on' : '') + '" role="radio" aria-checked="' + (v.id === sel) + '" data-action="dash-pick" data-id="' + esc(v.id) + '">' +
        (v.id ? '<i class="dot" style="background:' + ui.vehicleColor(v.id) + '"></i>' : '') + esc(v.name) + '</button>').join('') : '';

    const today = CF.todayISO(), ym = today.slice(0, 7), yr = today.slice(0, 4);
    const map = calc.computeAll(s.fills);
    const led = calc.ledger(s).filter((e) => !sel || e.vehicleId === sel);
    const month = led.filter((e) => e.date.slice(0, 7) === ym), year = led.filter((e) => e.date.slice(0, 4) === yr);
    const fuelM = month.filter((e) => e.type === 'fuel');
    const fillsSel = s.fills.filter((f) => !sel || f.vehicleId === sel);
    const fillsM = fillsSel.filter((f) => f.date.slice(0, 7) === ym);
    const litersM = fillsM.filter((f) => unitOf(f.fuel) === 'L').reduce((a, f) => a + f.qty, 0);
    const gncM = fillsM.filter((f) => unitOf(f.fuel) !== 'L').reduce((a, f) => a + f.qty, 0);
    // precio promedio por litro: últimos 90 días
    const d90 = new Date(); d90.setDate(d90.getDate() - 90);
    const p90 = d90.getFullYear() + '-' + String(d90.getMonth() + 1).padStart(2, '0') + '-' + String(d90.getDate()).padStart(2, '0');
    const recent = fillsSel.filter((f) => unitOf(f.fuel) === 'L' && f.date >= p90);
    const rq = recent.reduce((a, f) => a + f.qty, 0), rt = recent.reduce((a, f) => a + f.total, 0);

    const cards = [
      stat('Gasto del mes', money0(calc.sum(month)), 'Combustible ' + money0(calc.sum(fuelM)) + ' · otros ' + money0(calc.sum(month) - calc.sum(fuelM))),
      stat('Gasto del año', money0(calc.sum(year)), yr),
      stat('Litros del mes', fmtNum(litersM, 1) + ' L', gncM > 0 ? '+ ' + fmtNum(gncM, 1) + ' m³ de GNC' : fillsM.length + ' cargas'),
      stat('Precio por litro', rq > 0 ? fmtMoney(rt / rq) : '—', 'promedio últimos 90 días')
    ];
    if (!sel && s.vehicles.length > 1) {
      const top = (pick) => {
        const by = {}; pick.forEach((e) => { by[e.k] = (by[e.k] || 0) + e.v; });
        const k = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
        return k ? { id: k, v: by[k] } : null;
      };
      const tl = top(fillsM.filter((f) => unitOf(f.fuel) === 'L').map((f) => ({ k: f.vehicleId, v: f.qty })));
      const tm = top(month.map((e) => ({ k: e.vehicleId, v: e.amount })));
      cards.push(stat('Más combustible (mes)', tl ? esc(ui.vehicleName(tl.id)) : '—', tl ? fmtNum(tl.v, 1) + ' L' : ''));
      cards.push(stat('Más gasto (mes)', tm ? esc(ui.vehicleName(tm.id)) : '—', tm ? money0(tm.v) : ''));
    } else if (sel) {
      const sm = calc.summary(fillsSel, map);
      cards.push(stat('Rendimiento', sm.avgKmPerL != null ? fmtNum(sm.avgKmPerL, 2) + ' km/L' : sm.avgKmPerM3 != null ? fmtNum(sm.avgKmPerM3, 2) + ' km/m³' : '—', sm.avgPer100 != null ? fmtNum(sm.avgPer100, 2) + ' L/100 km' : ''));
      cards.push(stat('Costo por km', sm.avgCostKm != null ? fmtMoney(sm.avgCostKm) : '—', sm.totalKm ? fmtNum(sm.totalKm, 0) + ' km recorridos' : ''));
    }
    $('#dash-cards').innerHTML = cards.join('');

    // próximos mantenimientos
    const al = calc.maintAlerts(s.maint, s.fills, today).filter((a) => !sel || a.record.vehicleId === sel).slice(0, 4);
    $('#dash-alerts').innerHTML = al.length ? '<ul class="list">' + al.map((a) =>
      '<li class="alert-item ' + a.status + '"><div class="info"><strong>' + MAINT_TYPES[a.record.type].icon + ' ' + MAINT_TYPES[a.record.type].label + ' · ' + esc(ui.vehicleName(a.record.vehicleId)) + '</strong>' +
      '<span>' + [a.record.nextDate ? (a.daysLeft < 0 ? 'venció ' : 'vence ') + fmtDate(a.record.nextDate) : '', a.record.nextKm != null ? fmtNum(a.record.nextKm, 0) + ' km' : ''].filter(Boolean).join(' · ') + '</span></div>' +
      '<span class="status ' + a.status + '">' + (a.status === 'overdue' ? '⛔ Vencido' : a.status === 'soon' ? '⚠️ Próximo' : '✅ Al día') + '</span></li>').join('') + '</ul>'
      : '<p class="muted">Sin vencimientos cargados. Registrá un mantenimiento con su próximo vencimiento para recibir avisos.</p>';

    // últimas cargas
    const last = calc.sortFills(fillsSel).reverse().slice(0, 5);
    $('#dash-fills').innerHTML = last.length ? '<ul class="list">' + last.map((f) =>
      '<li><div class="info"><strong>' + esc(ui.vehicleName(f.vehicleId)) + ' · ' + fmtMoney(f.total) + '</strong><span>' + fmtDate(f.date) + ' · ' + fmtNum(f.qty, 2) + ' ' + unitOf(f.fuel) +
      (f.driverId ? ' · ' + esc(ui.driverName(f.driverId)) : '') + '</span></div></li>').join('') + '</ul>' : '<p class="muted">Todavía no hay cargas.</p>';
  }

  ui.action('dash-pick', (id) => { sel = id; render(); });
  ui.register(render);
})(window);
