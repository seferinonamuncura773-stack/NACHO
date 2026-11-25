/* Estadísticas: gasto mensual por vehículo, evolución del precio, rendimiento y costo por km */
(function (root) {
  'use strict';
  const CF = root.CF, ui = CF.ui, store = CF.store, calc = CF.calc;
  const { esc, fmtNum, fmtMoney, FUELS, unitWord } = CF;
  const $ = ui.$;
  const S = () => store.get();

  function sinceISO(period) {
    if (period === 'all') return '0000-00-00';
    const d = new Date(); d.setMonth(d.getMonth() - Number(period));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function render() {
    const s = S();
    if (ui.current() !== 'estadisticas') return;
    ui.fillSelect($('#st-vehicle'), s.vehicles.map((v) => ({ value: v.id, label: v.name })), { blank: 'Todos' });
    const vid = $('#st-vehicle').value, period = $('#st-period').value, since = sinceISO(period);
    const map = calc.computeAll(s.fills);
    const color = (i) => 'var(--s' + (i % 8 + 1) + ')';

    // 1) gasto mensual por vehículo (todos los gastos)
    const led = calc.ledger(s).filter((e) => e.date >= since);
    const sp = calc.spendByMonth(led, s.vehicles, period === 'all' ? 24 : Number(period));
    CF.charts.bars($('#st-spend'), { labels: sp.labels, ariaLabel: 'Gasto mensual por vehículo',
      series: sp.series.map((x) => ({ name: x.name, color: color(x.colorIndex), values: x.values })), fmtVal: fmtMoney });

    // 2) evolución del precio
    const fuelColor = { super: 'var(--s1)', premium: 'var(--s2)', diesel: 'var(--s3)', gnc: 'var(--s4)' };
    const ps = calc.priceSeries(s.fills.filter((f) => f.date >= since), vid);
    CF.charts.lines($('#st-price'), { ariaLabel: 'Evolución del precio del combustible',
      series: ps.map((x) => ({ name: FUELS[x.fuel].label + ' ($/' + unitWord(x.fuel) + ')', color: fuelColor[x.fuel], points: x.points })), fmtVal: fmtMoney });

    // 3) rendimiento (km/L) por vehículo
    const eff = calc.efficiencySeries(s.fills.filter((f) => f.date >= since && (!vid || f.vehicleId === vid)), map);
    const effSeries = s.vehicles.map((v, i) => ({ name: v.name, color: color(i), points: eff[v.id] || [] })).filter((x) => x.points.length);
    CF.charts.lines($('#st-eff'), { ariaLabel: 'Rendimiento por vehículo', series: effSeries, fmtVal: (n) => fmtNum(n, 2) + ' km/L' });

    // 4) costo por km por vehículo
    const cpk = s.vehicles.filter((v) => !vid || v.id === vid).map((v, i) => {
      const rows = s.fills.filter((f) => f.vehicleId === v.id && f.date >= since);
      return { name: v.name, val: calc.summary(rows, map).avgCostKm };
    }).filter((x) => x.val != null);
    CF.charts.bars($('#st-cpk'), { labels: cpk.map((x) => x.name), ariaLabel: 'Costo por kilómetro por vehículo',
      series: [{ name: 'Costo por km', color: 'var(--s2)', values: cpk.map((x) => x.val) }], fmtVal: fmtMoney });
  }

  document.addEventListener('cf:view', (e) => { if (e.detail === 'estadisticas') render(); });
  $('#st-vehicle').addEventListener('change', render);
  $('#st-period').addEventListener('change', render);
  let rt = null;
  root.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 200); });
  ui.register(render);
})(window);
