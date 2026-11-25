/* Gráficos SVG sin dependencias: barras agrupadas y líneas, con tooltip y vista de tabla.
 * Colores por variables CSS (--s1…--s8) para que sigan el modo claro/oscuro. */
(function (root) {
  'use strict';
  const CF = root.CF;
  const esc = CF.esc;
  const charts = CF.charts = {};

  /* ---------- helpers ---------- */
  function niceTicks(lo, hi, count) {
    if (!(hi > lo)) { hi = lo + 1; }
    const raw = (hi - lo) / count;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
    const start = Math.floor(lo / step + 1e-9) * step;
    const list = [];
    for (let v = start; v < hi + step * 0.999; v += step) list.push(Math.round(v / step * 1e6) / 1e6 * step);
    return { min: list[0], max: list[list.length - 1], step: step, list: list };
  }
  const moneyShort = (n) => n >= 1e6 ? CF.fmtNum(n / 1e6, 1) + ' M'
    : n >= 1e3 ? CF.fmtNum(n / 1e3, (n / 1e3) % 1 ? 1 : 0) + ' k' : CF.fmtNum(n, 0);

  function shell(host, series, ariaLabel) {
    const legend = series.length >= 2
      ? '<ul class="legend">' + series.map((s) =>
        '<li><i style="background:' + s.color + '"></i>' + esc(s.name) + '</li>').join('') + '</ul>' : '';
    host.innerHTML = legend +
      '<div class="chart-box"><div class="chart-svg" role="img" aria-label="' + esc(ariaLabel) + '"></div>' +
      '<div class="chart-tip hidden"></div></div>' +
      '<button type="button" class="btn text mini chart-toggle">Ver tabla</button>' +
      '<div class="table-wrap chart-table hidden"></div>';
    const toggle = host.querySelector('.chart-toggle');
    const tbl = host.querySelector('.chart-table');
    const box = host.querySelector('.chart-box');
    toggle.addEventListener('click', () => {
      const show = tbl.classList.toggle('hidden') === false;
      box.classList.toggle('hidden', show);
      toggle.textContent = show ? 'Ver gráfico' : 'Ver tabla';
    });
    return { svgHost: host.querySelector('.chart-svg'), tip: host.querySelector('.chart-tip'), box: box, tbl: tbl };
  }

  function placeTip(tip, box, cx, html) {
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    const bw = box.clientWidth, tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(bw - tw, cx - tw / 2)) + 'px';
    tip.style.top = '4px';
  }

  const GRID = 'stroke:var(--grid);stroke-width:1';
  const AX = 'fill:var(--text-secondary);font-size:11px';

  /* ---------- Barras agrupadas ----------
   * o = { labels:[], series:[{name,color,values:[]}], fmtVal(n), ariaLabel } */
  charts.bars = function (host, o) {
    const total = o.series.reduce((a, s) => a + s.values.reduce((x, y) => x + y, 0), 0);
    if (!total) { host.innerHTML = '<p class="muted">Todavía no hay datos para graficar.</p>'; return; }
    const ui = shell(host, o.series, o.ariaLabel);
    const W = Math.max(260, ui.svgHost.clientWidth || host.clientWidth || 320), H = 230;
    const M = { l: 46, r: 6, t: 8, b: 26 };
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const max = Math.max.apply(null, o.series.map((s) => Math.max.apply(null, s.values)));
    const tk = niceTicks(0, max, 4);
    const y = (v) => M.t + ph - (v / tk.max) * ph;
    const n = o.labels.length, k = o.series.length;
    const gw = pw / n, pad = gw * 0.14, gap = 2;
    const bw = Math.max(2, Math.min(22, (gw - 2 * pad - gap * (k - 1)) / k));
    const content = k * bw + (k - 1) * gap;
    let s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" focusable="false">';
    tk.list.forEach((v) => {
      s += '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" style="' + GRID + '"/>' +
        '<text x="' + (M.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" style="' + AX + '">' + moneyShort(v) + '</text>';
    });
    const every = gw < 34 ? 2 : 1;
    o.labels.forEach((l, i) => {
      if (i % every === (n - 1) % every || every === 1) {
        s += '<text x="' + (M.l + gw * i + gw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" style="' + AX + '">' + esc(l) + '</text>';
      }
    });
    s += '<rect id="hl" x="0" y="' + M.t + '" width="' + gw + '" height="' + ph + '" style="fill:var(--text-primary);opacity:0" />';
    o.series.forEach((sr, si) => {
      sr.values.forEach((v, i) => {
        if (!(v > 0)) return;
        const x = M.l + gw * i + (gw - content) / 2 + si * (bw + gap);
        const top = y(v), h = M.t + ph - top, r = Math.min(3, bw / 2, h);
        s += '<path d="M' + x + ',' + (top + h) + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top +
          'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + r) + 'V' + (top + h) + 'Z" style="fill:' + sr.color + '"/>';
      });
    });
    s += '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + (M.t + ph) + '" y2="' + (M.t + ph) + '" style="stroke:var(--axis);stroke-width:1"/>';
    s += '</svg>';
    ui.svgHost.innerHTML = s;

    const hl = ui.svgHost.querySelector('#hl');
    function show(ev) {
      const r = ui.svgHost.getBoundingClientRect();
      const i = Math.floor((ev.clientX - r.left - M.l) / gw);
      if (i < 0 || i >= n) return hide();
      hl.setAttribute('x', M.l + gw * i); hl.style.opacity = '0.07';
      const rows = o.series.filter((sr) => sr.values[i] > 0).map((sr) =>
        '<div><i style="background:' + sr.color + '"></i>' + esc(sr.name) + ': <b>' + o.fmtVal(sr.values[i]) + '</b></div>').join('');
      placeTip(ui.tip, ui.box, M.l + gw * i + gw / 2, '<strong>' + esc(o.labels[i]) + '</strong>' + (rows || '<div>Sin gastos</div>'));
    }
    function hide() { hl.style.opacity = '0'; ui.tip.classList.add('hidden'); }
    ui.svgHost.addEventListener('pointermove', show);
    ui.svgHost.addEventListener('pointerdown', show);
    ui.svgHost.addEventListener('pointerleave', hide);

    ui.tbl.innerHTML = '<table class="hist-table" style="display:table"><thead><tr><th>Mes</th>' +
      o.series.map((sr) => '<th>' + esc(sr.name) + '</th>').join('') + '</tr></thead><tbody>' +
      o.labels.map((l, i) => '<tr><td>' + esc(l) + '</td>' +
        o.series.map((sr) => '<td>' + (sr.values[i] > 0 ? o.fmtVal(sr.values[i]) : '—') + '</td>').join('') + '</tr>').join('') +
      '</tbody></table>';
  };

  /* ---------- Líneas (eje X temporal) ----------
   * o = { series:[{name,color,points:[{t,y,date}]}], fmtVal(n), ariaLabel } */
  charts.lines = function (host, o) {
    const pts = [].concat.apply([], o.series.map((s) => s.points));
    if (!pts.length) { host.innerHTML = '<p class="muted">Todavía no hay datos para graficar.</p>'; return; }
    const ui = shell(host, o.series, o.ariaLabel);
    const W = Math.max(260, ui.svgHost.clientWidth || host.clientWidth || 320), H = 230;
    const M = { l: 52, r: 12, t: 10, b: 26 };
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const DAY = 86400000;
    let t0 = Math.min.apply(null, pts.map((p) => p.t)), t1 = Math.max.apply(null, pts.map((p) => p.t));
    if (t0 === t1) { t0 -= 15 * DAY; t1 += 15 * DAY; }
    let lo = Math.min.apply(null, pts.map((p) => p.y)), hi = Math.max.apply(null, pts.map((p) => p.y));
    const rng = (hi - lo) || hi * 0.1 || 1;
    const tk = niceTicks(Math.max(0, lo - rng * 0.15), hi + rng * 0.15, 4);
    const x = (t) => M.l + (t - t0) / (t1 - t0) * pw;
    const y = (v) => M.t + ph - (v - tk.min) / (tk.max - tk.min) * ph;
    const dec = tk.step < 1 ? 2 : 0;
    let s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" focusable="false">';
    tk.list.forEach((v) => {
      s += '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" style="' + GRID + '"/>' +
        '<text x="' + (M.l - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" style="' + AX + '">' + CF.fmtNum(v, dec) + '</text>';
    });
    const span = (t1 - t0) / DAY, nx = W < 420 ? 3 : 5;
    for (let i = 0; i < nx; i++) {
      const t = t0 + (t1 - t0) * i / (nx - 1);
      const d = new Date(t);
      const lab = span > 200 ? CF.calc.monthLabel(d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'))
        : String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0');
      s += '<text x="' + x(t) + '" y="' + (H - 8) + '" text-anchor="' + (i === 0 ? 'start' : i === nx - 1 ? 'end' : 'middle') + '" style="' + AX + '">' + lab + '</text>';
    }
    s += '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + (M.t + ph) + '" y2="' + (M.t + ph) + '" style="stroke:var(--axis);stroke-width:1"/>';
    s += '<line id="xh" x1="0" x2="0" y1="' + M.t + '" y2="' + (M.t + ph) + '" style="stroke:var(--axis);stroke-width:1;opacity:0"/>';
    const flat = [];
    o.series.forEach((sr) => {
      if (sr.points.length > 1) {
        s += '<polyline fill="none" stroke-linejoin="round" stroke-linecap="round" style="stroke:' + sr.color + ';stroke-width:2" points="' +
          sr.points.map((p) => x(p.t).toFixed(1) + ',' + y(p.y).toFixed(1)).join(' ') + '"/>';
      }
      if (sr.points.length <= 60) {
        sr.points.forEach((p) => {
          s += '<circle cx="' + x(p.t).toFixed(1) + '" cy="' + y(p.y).toFixed(1) + '" r="4" style="fill:' + sr.color + ';stroke:var(--surface);stroke-width:2"/>';
        });
      }
      sr.points.forEach((p) => flat.push({ px: x(p.t), py: y(p.y), p: p, sr: sr }));
    });
    s += '<circle id="dot" r="6" cx="0" cy="0" style="fill:none;stroke:var(--text-primary);stroke-width:2;opacity:0"/>';
    s += '</svg>';
    ui.svgHost.innerHTML = s;

    const xh = ui.svgHost.querySelector('#xh'), dot = ui.svgHost.querySelector('#dot');
    function show(ev) {
      const r = ui.svgHost.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      let best = null, bd = 1e12;
      flat.forEach((q) => { const d = (q.px - mx) * (q.px - mx) + (q.py - my) * (q.py - my) * 0.25; if (d < bd) { bd = d; best = q; } });
      if (!best) return;
      xh.setAttribute('x1', best.px); xh.setAttribute('x2', best.px); xh.style.opacity = '1';
      dot.setAttribute('cx', best.px); dot.setAttribute('cy', best.py); dot.style.opacity = '1';
      placeTip(ui.tip, ui.box, best.px, '<strong>' + CF.fmtDate(best.p.date) + '</strong><div><i style="background:' +
        best.sr.color + '"></i>' + esc(best.sr.name) + ': <b>' + o.fmtVal(best.p.y) + '</b></div>');
    }
    function hide() { xh.style.opacity = '0'; dot.style.opacity = '0'; ui.tip.classList.add('hidden'); }
    ui.svgHost.addEventListener('pointermove', show);
    ui.svgHost.addEventListener('pointerdown', show);
    ui.svgHost.addEventListener('pointerleave', hide);

    const all = flat.map((q) => ({ date: q.p.date, name: q.sr.name, y: q.p.y })).sort((a, b) => (a.date < b.date ? 1 : -1));
    ui.tbl.innerHTML = '<table class="hist-table" style="display:table"><thead><tr><th>Fecha</th><th>Combustible</th><th>Precio</th></tr></thead><tbody>' +
      all.map((r) => '<tr><td>' + CF.fmtDate(r.date) + '</td><td>' + esc(r.name) + '</td><td>' + o.fmtVal(r.y) + '</td></tr>').join('') +
      '</tbody></table>';
  };
})(window);
