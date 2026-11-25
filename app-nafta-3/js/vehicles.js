/* Pestaña Vehículos: ficha de cada auto (km, gastos totales, rendimiento, desglose, evolución del consumo) */
(function (root) {
  'use strict';
  const CF = root.CF, ui = CF.ui, store = CF.store, calc = CF.calc;
  const { esc, fmtNum, fmtMoney, fmtDate, FUELS, EXPENSE_CATEGORIES, MAINT_TYPES } = CF;
  const $ = ui.$;
  const S = () => store.get();
  const open = new Set();

  function stat(label, value) { return '<div class="mini-stat"><span>' + label + '</span><b>' + value + '</b></div>'; }

  function detailHTML(v, st, map) {
    const rows = [];
    rows.push(['⛽ Combustible', st.fuel]);
    if (st.maint) rows.push(['🔧 Mantenimiento', st.maint]);
    Object.keys(st.byCat).forEach((k) => rows.push([EXPENSE_CATEGORIES[k].icon + ' ' + EXPENSE_CATEGORIES[k].label, st.byCat[k]]));
    const max = Math.max.apply(null, rows.map((r) => r[1]).concat([1]));
    const bars = rows.map((r) => '<div class="bar-row"><span>' + r[0] + '</span><b>' + fmtMoney(r[1]) + '</b>' +
      '<i style="width:' + Math.max(2, Math.round(r[1] / max * 100)) + '%"></i></div>').join('');
    const al = calc.maintAlerts(S().maint, S().fills, CF.todayISO()).filter((a) => a.record.vehicleId === v.id);
    const alHtml = al.length ? '<ul class="list">' + al.map((a) => '<li><div class="info"><strong>' + MAINT_TYPES[a.record.type].icon + ' ' + MAINT_TYPES[a.record.type].label + '</strong><span>' +
      [a.record.nextDate ? fmtDate(a.record.nextDate) : '', a.record.nextKm != null ? fmtNum(a.record.nextKm, 0) + ' km' : ''].filter(Boolean).join(' · ') +
      '</span></div><span class="status ' + a.status + '">' + (a.status === 'overdue' ? '⛔ Vencido' : a.status === 'soon' ? '⚠️ Próximo' : '✅ Al día') + '</span></li>').join('') + '</ul>'
      : '<p class="muted small">Sin vencimientos cargados para este vehículo.</p>';
    return '<h4>Dónde se va la plata</h4>' + (rows.length ? bars : '<p class="muted small">Sin gastos todavía.</p>') +
      '<h4>Próximos vencimientos</h4>' + alHtml +
      '<h4>Evolución del consumo</h4><div class="chart" id="vc-' + esc(v.id) + '"></div>' +
      '<div class="row wrap" style="margin-top:12px"><button type="button" class="btn mini" data-action="edit-vehicle" data-id="' + esc(v.id) + '">Editar vehículo</button>' +
      '<button type="button" class="btn mini danger" data-action="delete-vehicle" data-id="' + esc(v.id) + '">Eliminar</button></div>';
  }

  function drawChart(v, map) {
    const host = document.getElementById('vc-' + v.id);
    if (!host) return;
    const series = calc.efficiencySeries(S().fills.filter((f) => f.vehicleId === v.id), map)[v.id] || [];
    if (series.length < 2) { host.innerHTML = '<p class="muted small">Hacen falta al menos 2 tramos "lleno a lleno" con km para ver la evolución.</p>'; return; }
    CF.charts.lines(host, { ariaLabel: 'Rendimiento de ' + v.name, series: [{ name: 'km por litro', color: 'var(--s1)', points: series }], fmtVal: (n) => fmtNum(n, 2) + ' km/L' });
  }

  function render() {
    const s = S();
    const host = $('#vehicle-fichas');
    if (!s.vehicles.length) { host.innerHTML = '<div class="card empty"><p class="muted">Todavía no agregaste vehículos.</p></div>'; return; }
    const map = calc.computeAll(s.fills);
    host.innerHTML = s.vehicles.map((v) => {
      const st = calc.vehicleStats(s, v.id, map), sm = st.summary;
      const eff = sm.avgKmPerL != null ? fmtNum(sm.avgKmPerL, 2) + ' km/L' : sm.avgKmPerM3 != null ? fmtNum(sm.avgKmPerM3, 2) + ' km/m³' : '—';
      return '<div class="card ficha"><div class="ficha-head"><div><strong class="ficha-name"><i class="dot" style="background:' + ui.vehicleColor(v.id) + '"></i>' + esc(v.name) + '</strong>' +
        '<div class="muted small">' + [v.plate, v.model, FUELS[v.fuel].label, v.tank ? 'tanque ' + fmtNum(v.tank, 0) + (v.fuel === 'gnc' ? ' m³' : ' L') : ''].filter(Boolean).map(esc).join(' · ') + '</div></div></div>' +
        '<div class="mini-grid">' + stat('Km actual', st.km != null ? fmtNum(st.km, 0) : '—') + stat('Total gastado', '$ ' + fmtNum(st.total, 0)) +
        stat('Litros cargados', fmtNum(sm.liters, 1) + ' L') + stat('Rendimiento', eff) +
        stat('Costo por km', sm.avgCostKm != null ? fmtMoney(sm.avgCostKm) : '—') + stat('Cargas', String(st.fills)) + '</div>' +
        '<details class="more" data-vid="' + esc(v.id) + '"' + (open.has(v.id) ? ' open' : '') + '><summary>Ver ficha completa</summary>' + detailHTML(v, st, map) + '</details></div>';
    }).join('');
    s.vehicles.forEach((v) => { if (open.has(v.id)) drawChart(v, map); });
  }

  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.matches || !d.matches('details[data-vid]')) return;
    const id = d.dataset.vid;
    if (d.open) { open.add(id); const v = S().vehicles.find((q) => q.id === id); if (v) drawChart(v, calc.computeAll(S().fills)); } else open.delete(id);
  }, true);

  ui.register(render);
})(window);
