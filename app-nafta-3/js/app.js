/* Pantallas Cargar, Resumen y Ajustes */
(function (root) {
  'use strict';
  const CF = root.CF, ui = CF.ui, store = CF.store, calc = CF.calc;
  const { esc, fmtNum, fmtMoney, fmtDate, FUELS, unitOf, unitWord, round2, todayISO } = CF;
  const $ = ui.$, $$ = ui.$$;
  const S = () => store.get();
  const byId = (col, id) => S()[col].find((x) => x.id === id);

  let editingFillId = null, editingVehicleId = null;
  const filters = { vehicleId: '', driverId: '', year: '', month: '' };

  const f = {
    form: $('#fill-form'), date: $('#f-date'), vehicle: $('#f-vehicle'), driver: $('#f-driver'), fuel: $('#f-fuel'),
    payer: $('#f-payer'), method: $('#f-method'),
    qty: $('#f-qty'), price: $('#f-price'), total: $('#f-total'), odo: $('#f-odo'), full: $('#f-full'), note: $('#f-note'),
    odoHint: $('#odo-hint'), priceHint: $('#price-hint'), warn: $('#odo-warning')
  };
  const FUEL_ITEMS = Object.keys(FUELS).map((k) => ({ value: k, label: FUELS[k].label }));

  /* =============== CARGAR =============== */
  function renderCargar() {
    const s = S();
    const has = s.vehicles.length > 0;
    $('#no-vehicles').classList.toggle('hidden', has);
    f.form.classList.toggle('hidden', !has);
    ui.fillSelect(f.vehicle, s.vehicles.map((v) => ({ value: v.id, label: v.name + (v.plate ? ' · ' + v.plate : '') })),
      { value: f.vehicle.value || s.settings.lastVehicleId || '' });
    ui.fillSelect(f.driver, s.drivers.map((d) => ({ value: d.id, label: d.name })),
      { blank: '— Sin especificar —', value: f.driver.value || s.settings.lastDriverId || '' });
    ui.fillSelect(f.payer, s.drivers.map((d) => ({ value: d.id, label: d.name })), { blank: 'Igual que quien cargó' });
    ui.fillSelect(f.method, CF.PAY_METHODS.map((m) => ({ value: m, label: m })), { blank: '—' });
    if (has) { updateUnits(); updateHints(); }
  }

  function updateUnits() {
    const fuel = f.fuel.value;
    $('#l-qty').textContent = unitOf(fuel) === 'L' ? 'Litros' : 'm³';
    ui.syncChips(f.vehicle, $('#chips-vehicle'), { dot: true });
    ui.syncChips(f.driver, $('#chips-driver'), { blank: 'Sin especificar' });
    $('#driver-block').classList.toggle('hidden', S().drivers.length === 0);
    $('#l-price').textContent = 'Precio por ' + unitWord(fuel) + ' ($)';
  }

  // Cargas vecinas (misma fecha o anterior / posterior) del mismo vehículo
  function neighbors(vehicleId, date, excludeId) {
    const list = calc.sortFills(S().fills.filter((x) => x.vehicleId === vehicleId && x.id !== excludeId && x.odo != null));
    let prev = null, next = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].date <= date) prev = list[i]; else { next = list[i]; break; }
    }
    return { prev: prev, next: next };
  }

  function odoWarnings() {
    const odo = CF.num(f.odo.value);
    const out = [];
    if (!f.vehicle.value || !isFinite(odo)) return out;
    const nb = neighbors(f.vehicle.value, f.date.value || todayISO(), editingFillId);
    if (nb.prev && odo < nb.prev.odo) out.push('El kilometraje (' + fmtNum(odo, 0) + ') es menor al de la carga anterior (' + fmtNum(nb.prev.odo, 0) + ' km, ' + fmtDate(nb.prev.date) + ').');
    else if (nb.prev && odo === nb.prev.odo) out.push('El kilometraje es igual al de la carga anterior (' + fmtNum(nb.prev.odo, 0) + ' km).');
    if (nb.next && odo > nb.next.odo) out.push('El kilometraje (' + fmtNum(odo, 0) + ') es mayor al de una carga posterior (' + fmtNum(nb.next.odo, 0) + ' km, ' + fmtDate(nb.next.date) + ').');
    return out;
  }

  function checkOdo() {
    const w = odoWarnings();
    f.warn.textContent = w.length ? '⚠️ ' + w.join(' ') : '';
    f.warn.classList.toggle('hidden', !w.length);
  }

  function updateHints() {
    const vid = f.vehicle.value;
    const nb = neighbors(vid, f.date.value || todayISO(), editingFillId);
    f.odoHint.textContent = nb.prev ? 'Última carga: ' + fmtNum(nb.prev.odo, 0) + ' km (' + fmtDate(nb.prev.date) + ')' : (vid ? 'Primera carga de este vehículo' : '');
    const lastSame = calc.sortFills(S().fills.filter((x) => x.vehicleId === vid && x.fuel === f.fuel.value && x.id !== editingFillId)).pop();
    f.priceHint.textContent = lastSame ? 'Última vez: ' + fmtMoney(lastSame.price) : '';
    checkOdo();
  }

  // Autocálculo cantidad ↔ precio ↔ total
  function onQtyOrPrice() {
    const q = CF.num(f.qty.value), p = CF.num(f.price.value), t = CF.num(f.total.value);
    if (q > 0 && p > 0) f.total.value = round2(q * p).toFixed(2);
    else if (q > 0 && t > 0 && !(p > 0)) f.price.value = round2(t / q).toFixed(2);
    else if (p > 0 && t > 0 && !(q > 0)) f.qty.value = round2(t / p).toFixed(2);
  }
  function onTotal() {
    const q = CF.num(f.qty.value), p = CF.num(f.price.value), t = CF.num(f.total.value);
    if (!(t > 0)) return;
    if (p > 0) f.qty.value = round2(t / p).toFixed(2);
    else if (q > 0) f.price.value = round2(t / q).toFixed(2);
  }

  function resetForm() {
    editingFillId = null;
    f.date.value = todayISO();
    f.qty.value = ''; f.price.value = ''; f.total.value = ''; f.odo.value = ''; f.note.value = '';
    f.full.checked = true; f.payer.value = ''; f.method.value = '';
    $('#form-title').textContent = 'Nueva carga';
    $('#btn-save-fill').textContent = 'Guardar carga';
    $('#btn-cancel-edit').classList.add('hidden');
    const v = byId('vehicles', f.vehicle.value);
    if (v) f.fuel.value = v.fuel;
    updateUnits(); updateHints();
  }

  function onSubmitFill(e) {
    e.preventDefault();
    const vehicle = byId('vehicles', f.vehicle.value);
    if (!vehicle) return ui.toast('Elegí un vehículo.', true);
    if (!CF.isISODate(f.date.value)) return ui.toast('Ingresá una fecha válida.', true);
    let qty = CF.num(f.qty.value), price = CF.num(f.price.value), total = CF.num(f.total.value);
    if (!(qty > 0) && price > 0 && total > 0) qty = round2(total / price);
    if (!(price > 0) && qty > 0 && total > 0) price = round2(total / qty);
    if (!(total > 0) && qty > 0 && price > 0) total = round2(qty * price);
    if (!(qty > 0 && price > 0 && total > 0)) return ui.toast('Completá al menos dos de: cantidad, precio y total.', true);
    const odo = CF.num(f.odo.value);
    if (!isFinite(odo) || odo < 0) return ui.toast('Ingresá el kilometraje actual.', true);

    const warnings = odoWarnings();
    if (f.fuel.value !== 'gnc' && vehicle.tank > 0 && qty > vehicle.tank * 1.05) {
      warnings.push('Cargaste ' + fmtNum(qty, 2) + ' L y el tanque es de ' + fmtNum(vehicle.tank, 0) + ' L.');
    }
    if (Math.abs(qty * price - total) > Math.max(1, total * 0.01)) warnings.push('El total no coincide con cantidad × precio.');
    if (warnings.length && !root.confirm('⚠️ ' + warnings.join('\n\n⚠️ ') + '\n\n¿Guardar igual?')) return;

    const old = editingFillId ? byId('fills', editingFillId) : null;
    const rec = {
      id: old ? old.id : CF.uid(), vehicleId: vehicle.id, driverId: f.driver.value || null,
      date: f.date.value, fuel: f.fuel.value, qty: qty, price: price, total: total, odo: odo,
      full: f.full.checked, note: f.note.value.trim(), createdAt: old ? old.createdAt : Date.now(),
      payerId: f.payer.value || f.driver.value || null, method: f.method.value, createdBy: old ? old.createdBy : null
    };
    store.upsert('fills', rec);
    store.setSettings({ lastVehicleId: vehicle.id, lastDriverId: rec.driverId });
    const wasEdit = !!old;
    resetForm();
    renderAll();
    showResult(rec, wasEdit);
    root.scrollTo(0, 0);
  }

  function showResult(rec, wasEdit) {
    const m = calc.computeAll(S().fills).get(rec.id) || {};
    const u = unitOf(rec.fuel);
    const chips = [];
    chips.push('<span class="chip">Km recorridos: <b>' + (m.km ? fmtNum(m.km, 0) + ' km' : '—') + '</b></span>');
    if (m.kmPerUnit) {
      chips.push('<span class="chip">Rendimiento: <b>' + fmtNum(m.kmPerUnit, 2) + ' km/' + u + '</b></span>');
      chips.push('<span class="chip"><b>' + fmtNum(m.per100, 2) + '</b> ' + u + '/100 km</span>');
    }
    chips.push('<span class="chip">Costo por km: <b>' + (m.costKm ? fmtMoney(m.costKm) : '—') + '</b></span>');
    let note = '';
    if (!rec.full) note = 'Marcá “tanque lleno” en las cargas completas para medir el rendimiento.';
    else if (!m.kmPerUnit) note = 'Rendimiento: hace falta una carga llena anterior como referencia (se calcula desde la próxima).';
    const box = $('#saved-result');
    box.innerHTML = '<h3>✅ ' + (wasEdit ? 'Cambios guardados' : 'Carga guardada') + '</h3>' +
      '<p class="muted">' + esc(ui.vehicleName(rec.vehicleId)) + ' · ' + fmtNum(rec.qty, 2) + ' ' + u + ' · ' + fmtMoney(rec.total) + '</p>' +
      '<div class="chips">' + chips.join('') + '</div>' + (note ? '<p class="muted small">' + note + '</p>' : '');
    box.classList.remove('hidden');
  }

  function startEditFill(id) {
    const x = byId('fills', id);
    if (!x) return;
    editingFillId = id;
    $('#saved-result').classList.add('hidden');
    f.date.value = x.date; f.vehicle.value = x.vehicleId; f.driver.value = x.driverId || '';
    f.fuel.value = x.fuel; f.qty.value = x.qty; f.price.value = x.price; f.total.value = x.total;
    f.odo.value = x.odo != null ? x.odo : ''; f.full.checked = x.full; f.note.value = x.note || '';
    f.payer.value = x.payerId && x.payerId !== x.driverId ? x.payerId : ''; f.method.value = x.method || '';
    $('#form-title').textContent = 'Editar carga';
    $('#btn-save-fill').textContent = 'Guardar cambios';
    $('#btn-cancel-edit').classList.remove('hidden');
    updateUnits(); updateHints();
    ui.showView('cargar');
    f.form.scrollIntoView();
  }

  /* =============== RESUMEN =============== */
  function renderFilters() {
    const s = S();
    ui.fillSelect($('#flt-vehicle'), s.vehicles.map((v) => ({ value: v.id, label: v.name })), { blank: 'Todos', value: filters.vehicleId });
    ui.fillSelect($('#flt-driver'), s.drivers.map((d) => ({ value: d.id, label: d.name })),
      { blank: 'Todos', extra: [{ value: '__none', label: 'Sin especificar' }], value: filters.driverId });
    const years = Array.from(new Set(s.fills.map((x) => x.date.slice(0, 4)))).sort().reverse();
    ui.fillSelect($('#flt-year'), years.map((y) => ({ value: y, label: y })), { blank: 'Todos', value: filters.year });
    ui.fillSelect($('#flt-month'), CF.MONTHS.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m })), { blank: 'Todos', value: filters.month });
    filters.vehicleId = $('#flt-vehicle').value; filters.driverId = $('#flt-driver').value;
    filters.year = $('#flt-year').value; filters.month = $('#flt-month').value;
  }

  function filteredRows() {
    const fills = S().fills;
    const map = calc.computeAll(fills);
    const rows = fills.filter((x) => {
      if (filters.vehicleId && x.vehicleId !== filters.vehicleId) return false;
      if (filters.driverId === '__none') { if (x.driverId) return false; }
      else if (filters.driverId && x.driverId !== filters.driverId) return false;
      if (filters.year && x.date.slice(0, 4) !== filters.year) return false;
      if (filters.month && x.date.slice(5, 7) !== filters.month) return false;
      return true;
    });
    return { rows: calc.sortFills(rows).reverse(), map: map };
  }

  function stat(label, value, sub) {
    return '<div class="stat"><div class="label">' + label + '</div><div class="value">' + value + '</div><div class="sub">' + (sub || '&nbsp;') + '</div></div>';
  }

  function renderSummary() {
    const { rows, map } = filteredRows();
    const sm = calc.summary(rows, map);
    let eff = '—', effSub = '';
    if (sm.avgKmPerL != null) { eff = fmtNum(sm.avgKmPerL, 2) + ' km/L'; effSub = fmtNum(sm.avgPer100, 2) + ' L/100 km'; }
    if (sm.avgKmPerM3 != null) {
      if (sm.avgKmPerL == null) eff = fmtNum(sm.avgKmPerM3, 2) + ' km/m³';
      else effSub += ' · GNC ' + fmtNum(sm.avgKmPerM3, 2) + ' km/m³';
    }
    $('#summary-cards').innerHTML =
      stat('Gasto total', '$ ' + fmtNum(sm.spent, 0), sm.count + (sm.count === 1 ? ' carga' : ' cargas')) +
      stat('Litros cargados', fmtNum(sm.liters, 1) + ' L', sm.gncM3 > 0 ? '+ ' + fmtNum(sm.gncM3, 1) + ' m³ de GNC' : '') +
      stat('Rendimiento prom.', eff, effSub) +
      stat('Costo prom. por km', sm.avgCostKm != null ? fmtMoney(sm.avgCostKm) : '—', sm.totalKm ? fmtNum(sm.totalKm, 0) + ' km recorridos' : '');
    $('#history-count').textContent = rows.length ? '(' + rows.length + ')' : '';
    $('#btn-csv').disabled = !rows.length;
    renderHistory(rows, map);
  }

  function rowView(x, m) {
    const u = unitOf(x.fuel);
    return {
      id: x.id, date: fmtDate(x.date), vehicle: esc(ui.vehicleName(x.vehicleId)), driver: esc(ui.driverName(x.driverId)),
      fuel: esc(FUELS[x.fuel].label), qty: fmtNum(x.qty, 2) + ' ' + u, price: fmtMoney(x.price), total: fmtMoney(x.total),
      odo: fmtNum(x.odo, 0), km: m.km ? fmtNum(m.km, 0) : '—',
      eff: m.kmPerUnit ? fmtNum(m.kmPerUnit, 2) + ' km/' + u : '—', per100: m.per100 ? fmtNum(m.per100, 2) : '—',
      costKm: m.costKm ? fmtMoney(m.costKm) : '—', full: x.full, note: esc(x.note || ''),
      payer: x.payerId ? esc(ui.driverName(x.payerId)) : '', by: x.createdBy ? esc(CF.sync.userName(x.createdBy)) : ''
    };
  }

  function renderHistory(rows, map) {
    const host = $('#history');
    if (!rows.length) {
      host.innerHTML = '<p class="muted">' + (S().fills.length ? 'No hay cargas con estos filtros.' : 'Todavía no registraste cargas.') + '</p>';
      return;
    }
    const views = rows.map((x) => rowView(x, map.get(x.id) || {}));
    const btns = (id) => '<button type="button" class="btn mini" data-action="edit-fill" data-id="' + esc(id) + '">Editar</button> ' +
      '<button type="button" class="btn mini danger" data-action="delete-fill" data-id="' + esc(id) + '">Eliminar</button>';
    const table = '<div class="table-wrap"><table class="hist-table"><thead><tr><th>Fecha</th><th>Vehículo</th><th>Conductor</th><th>Combustible</th>' +
      '<th>Cantidad</th><th>Precio</th><th>Total</th><th>Odómetro</th><th>Km rec.</th><th>Rendimiento</th><th>L/100 km</th><th>$/km</th><th></th></tr></thead><tbody>' +
      views.map((v) => '<tr><td>' + v.date + '</td><td>' + v.vehicle + (v.note ? '<div class="note">' + v.note + '</div>' : '') + '</td><td>' + v.driver + '</td><td>' + v.fuel +
        (v.full ? '' : ' <span class="badge">parcial</span>') + '</td><td>' + v.qty + '</td><td>' + v.price + '</td><td><b>' + v.total + '</b></td><td>' + v.odo +
        '</td><td>' + v.km + '</td><td>' + v.eff + '</td><td>' + v.per100 + '</td><td>' + v.costKm + '</td><td>' + btns(v.id) + '</td></tr>').join('') +
      '</tbody></table></div>';
    const cards = '<div class="hist-cards">' + views.map((v) =>
      '<div class="h-card"><div class="h-top"><span class="title">' + v.vehicle + '</span><span class="total">' + v.total + '</span></div>' +
      '<div class="h-sub">' + v.date + ' · ' + v.driver + ' · ' + v.fuel + (v.full ? '' : ' · parcial') + (v.payer && v.payer !== v.driver ? ' · pagó ' + v.payer : '') + (v.by ? ' · registró ' + v.by : '') + (v.note ? ' · ' + v.note : '') + '</div>' +
      '<div class="chips"><span class="chip"><b>' + v.qty + '</b> a ' + v.price + '</span><span class="chip">Odóm. <b>' + v.odo + '</b></span>' +
      '<span class="chip">Km rec. <b>' + v.km + '</b></span><span class="chip">Rend. <b>' + v.eff + '</b></span>' +
      '<span class="chip">$/km <b>' + v.costKm + '</b></span></div>' +
      '<div class="h-actions">' + btns(v.id) + '</div></div>').join('') + '</div>';
    host.innerHTML = table + cards;
  }

  function exportCSV() {
    const { rows, map } = filteredRows();
    if (!rows.length) return ui.toast('No hay cargas para exportar.', true);
    const q = (v) => { const s = String(v == null ? '' : v); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const n = (v, d) => (v == null || !isFinite(v)) ? '' : Number(v).toFixed(d).replace('.', ',');
    const head = ['Fecha', 'Vehículo', 'Patente', 'Conductor', 'Combustible', 'Cantidad', 'Unidad', 'Precio unitario', 'Total',
      'Pagó', 'Medio de pago', 'Odómetro', 'Tanque lleno', 'Km recorridos', 'Rendimiento (km/unidad)', 'Unidades cada 100 km', 'Costo por km', 'Estación / nota'];
    const lines = [head.map(q).join(';')];
    rows.slice().reverse().forEach((x) => {
      const m = map.get(x.id) || {};
      const v = byId('vehicles', x.vehicleId);
      lines.push([x.date, v ? v.name : '', v ? v.plate : '', ui.driverName(x.driverId) === '—' ? '' : ui.driverName(x.driverId),
        FUELS[x.fuel].label, n(x.qty, 2), unitOf(x.fuel), n(x.price, 2), n(x.total, 2), ui.driverName(x.payerId) === '—' ? '' : ui.driverName(x.payerId), x.method || '', n(x.odo, 0), x.full ? 'Sí' : 'No',
        n(m.km, 0), n(m.kmPerUnit, 2), n(m.per100, 2), n(m.costKm, 2), x.note || ''].map(q).join(';'));
    });
    ui.download('historial-combustible-' + todayISO() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    ui.toast('CSV exportado (' + rows.length + ' cargas)');
  }

  /* =============== AJUSTES =============== */
  function renderVehicles() {
    const s = S();
    const list = $('#vehicle-list');
    if (!list) return;
    list.innerHTML = s.vehicles.length ? s.vehicles.map((v) => {
      const n = s.fills.filter((x) => x.vehicleId === v.id).length;
      return '<li><div class="info"><strong><i class="dot" style="background:' + ui.vehicleColor(v.id) + '"></i>' + esc(v.name) + '</strong>' +
        '<span>' + [v.plate, v.model].filter(Boolean).map(esc).join(' · ') + (v.plate || v.model ? ' · ' : '') + FUELS[v.fuel].label +
        (v.tank ? ' · tanque ' + fmtNum(v.tank, 0) + (v.fuel === 'gnc' ? ' m³' : ' L') : '') + ' · ' + n + ' cargas</span></div>' +
        '<div class="actions"><button type="button" class="btn mini" data-action="edit-vehicle" data-id="' + esc(v.id) + '">Editar</button>' +
        '<button type="button" class="btn mini danger" data-action="delete-vehicle" data-id="' + esc(v.id) + '">Eliminar</button></div></li>';
    }).join('') : '<li class="muted">Todavía no agregaste vehículos.</li>';
  }

  function renderDrivers() {
    const s = S();
    $('#driver-list').innerHTML = s.drivers.length ? s.drivers.map((d) =>
      '<li><div class="info"><strong>' + esc(d.name) + '</strong><span>' + s.fills.filter((x) => x.driverId === d.id).length + ' cargas</span></div>' +
      '<div class="actions"><button type="button" class="btn mini" data-action="edit-driver" data-id="' + esc(d.id) + '">Renombrar</button>' +
      '<button type="button" class="btn mini danger" data-action="delete-driver" data-id="' + esc(d.id) + '">Eliminar</button></div></li>'
    ).join('') : '<li class="muted">Agregá a los integrantes de la familia para saber quién cargó o pagó.</li>';
  }

  function resetVehicleForm() {
    editingVehicleId = null;
    $('#v-name').value = ''; $('#v-plate').value = ''; $('#v-model').value = ''; $('#v-tank').value = '';
    $('#v-fuel').value = 'super';
    $('#vehicle-form-title').textContent = 'Vehículos';
    $('#btn-save-vehicle').textContent = 'Agregar vehículo';
    $('#btn-v-cancel').classList.add('hidden');
  }

  function onSubmitVehicle(e) {
    e.preventDefault();
    const name = $('#v-name').value.trim();
    if (!name) return ui.toast('Poné un nombre o apodo al vehículo.', true);
    const tank = CF.num($('#v-tank').value);
    const old = editingVehicleId ? byId('vehicles', editingVehicleId) : null;
    store.upsert('vehicles', {
      id: old ? old.id : CF.uid(), name: name, plate: $('#v-plate').value.trim().toUpperCase(),
      model: $('#v-model').value.trim(), fuel: $('#v-fuel').value, tank: tank > 0 ? tank : 0
    });
    ui.toast(old ? 'Vehículo actualizado' : 'Vehículo agregado');
    resetVehicleForm();
    renderAll();
  }

  function onSubmitDriver(e) {
    e.preventDefault();
    const name = $('#d-name').value.trim();
    if (!name) return;
    if (S().drivers.some((d) => d.name.toLowerCase() === name.toLowerCase())) return ui.toast('Ya existe un integrante con ese nombre.', true);
    store.upsert('drivers', { id: CF.uid(), name: name });
    $('#d-name').value = '';
    renderAll();
  }

  /* =============== Acciones =============== */
  ui.action('edit-fill', startEditFill);
  ui.action('delete-fill', (id) => {
    const x = byId('fills', id);
    if (!x || !root.confirm('¿Eliminar la carga del ' + fmtDate(x.date) + ' de ' + ui.vehicleName(x.vehicleId) + '?')) return;
    store.remove('fills', id);
    if (editingFillId === id) resetForm();
    renderAll(); ui.toast('Carga eliminada');
  });
  ui.action('edit-vehicle', (id) => {
    const v = byId('vehicles', id); if (!v) return;
    editingVehicleId = id;
    $('#v-name').value = v.name; $('#v-plate').value = v.plate; $('#v-model').value = v.model;
    $('#v-fuel').value = v.fuel; $('#v-tank').value = v.tank || '';
    $('#vehicle-form-title').textContent = 'Editar vehículo';
    $('#btn-save-vehicle').textContent = 'Guardar cambios';
    $('#btn-v-cancel').classList.remove('hidden');
    $('#vehicle-details').open = true;
    $('#v-name').focus();
    $('#vehicle-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  ui.action('delete-vehicle', (id) => {
    const v = byId('vehicles', id); if (!v) return;
    const n = S().fills.length ? S().fills.filter((x) => x.vehicleId === id).length : 0;
    const m = S().maint.filter((x) => x.vehicleId === id).length;
    if (!root.confirm('¿Eliminar "' + v.name + '"?' + (n || m ? '\n\nSe borrarán también sus ' + n + ' cargas y ' + m + ' mantenimientos.' : ''))) return;
    store.remove('vehicles', id);
    if (editingVehicleId === id) resetVehicleForm();
    if (f.vehicle.value === id) f.vehicle.value = '';
    renderAll(); ui.toast('Vehículo eliminado');
  });
  ui.action('edit-driver', (id) => {
    const d = byId('drivers', id); if (!d) return;
    const name = (root.prompt('Nuevo nombre:', d.name) || '').trim();
    if (!name || name === d.name) return;
    store.upsert('drivers', Object.assign({}, d, { name: name }));
    renderAll();
  });
  ui.action('delete-driver', (id) => {
    const d = byId('drivers', id); if (!d) return;
    if (!root.confirm('¿Eliminar a "' + d.name + '"? Sus cargas quedarán sin conductor asignado.')) return;
    store.remove('drivers', id);
    renderAll();
  });

  ui.action('load-seed', () => {
    if (!root.confirm('Se agregan 3 vehículos y 11 cargas históricas (sin borrar lo que ya tenés). ¿Continuar?')) return;
    const r = store.importMerge(JSON.stringify(CF.SEED));
    renderAll();
    ui.toast(r.fills ? 'Agregado: ' + r.vehicles + ' vehículos y ' + r.fills + ' cargas' : 'Esos datos ya estaban cargados');
    ui.showView('inicio');
  });

  /* =============== Render general =============== */
  function renderAll() { ui.renderAll(); }
  ui.register(renderCargar);
  ui.register(() => { renderFilters(); renderSummary(); });
  ui.register(() => { renderVehicles(); renderDrivers(); });

  /* =============== Eventos =============== */
  function init() {
    ['f-fuel', 'v-fuel'].forEach((id) => {
      $('#' + id).innerHTML = FUEL_ITEMS.map((i) => '<option value="' + i.value + '">' + esc(i.label) + '</option>').join('');
    });
    f.date.value = todayISO();

    f.form.addEventListener('submit', onSubmitFill);
    f.vehicle.addEventListener('change', () => {
      const v = byId('vehicles', f.vehicle.value);
      if (v && !editingFillId) f.fuel.value = v.fuel;
      updateUnits(); updateHints();
    });
    f.fuel.addEventListener('change', () => { updateUnits(); updateHints(); });
    f.date.addEventListener('change', updateHints);
    f.odo.addEventListener('input', checkOdo);
    f.qty.addEventListener('input', onQtyOrPrice);
    f.price.addEventListener('input', onQtyOrPrice);
    f.total.addEventListener('input', onTotal);
    $('#btn-cancel-edit').addEventListener('click', () => { resetForm(); });

    ['vehicle', 'driver', 'year', 'month'].forEach((k) => {
      $('#flt-' + k).addEventListener('change', (e) => { filters[k === 'vehicle' ? 'vehicleId' : k === 'driver' ? 'driverId' : k] = e.target.value; renderSummary(); });
    });
    $('#btn-clear-filters').addEventListener('click', () => {
      filters.vehicleId = filters.driverId = filters.year = filters.month = '';
      renderFilters(); renderSummary();
    });
    $('#btn-csv').addEventListener('click', exportCSV);

    $('#vehicle-form').addEventListener('submit', onSubmitVehicle);
    $('#btn-v-cancel').addEventListener('click', resetVehicleForm);
    $('#driver-form').addEventListener('submit', onSubmitDriver);

    $('#btn-export-json').addEventListener('click', () => {
      ui.download('respaldo-combustible-' + todayISO() + '.json', store.exportJSON(), 'application/json');
      ui.toast('Respaldo exportado');
    });
    $('#file-import').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const probe = JSON.parse(rd.result);
          const nf = Array.isArray(probe.fills) ? probe.fills.length : 0;
          if (!root.confirm('Se van a REEMPLAZAR todos los datos actuales por el respaldo (' + nf + ' cargas). ¿Continuar?')) return;
          const r = store.replaceAll(rd.result);
          resetForm(); resetVehicleForm(); renderAll();
          ui.toast('Importado: ' + r.vehicles + ' vehículos, ' + r.fills + ' cargas, ' + r.maint + ' mantenimientos');
        } catch (err) { ui.toast(err.message || 'No se pudo importar el archivo.', true); }
      };
      rd.onerror = () => ui.toast('No se pudo leer el archivo.', true);
      rd.readAsText(file);
    });
    $('#file-merge').addEventListener('change', (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const r = store.importMerge(rd.result);
          renderAll();
          ui.toast('Agregado: ' + r.vehicles + ' vehículos, ' + r.fills + ' cargas, ' + r.maint + ' mantenimientos');
        } catch (err) { ui.toast(err.message || 'No se pudo importar el archivo.', true); }
      };
      rd.onerror = () => ui.toast('No se pudo leer el archivo.', true);
      rd.readAsText(file);
    });
    $('#btn-reset').addEventListener('click', () => {
      if (!root.confirm('¿Borrar TODOS los datos (vehículos, cargas y mantenimientos)? Si usás sincronización, también se borran en los demás celulares.')) return;
      if (!root.confirm('Última confirmación: esta acción no se puede deshacer. ¿Borrar todo?')) return;
      store.reset(); resetForm(); resetVehicleForm(); renderAll(); ui.toast('Datos borrados');
    });

    store.subscribe((kind) => { if (kind === 'remote') { renderAll(); } });
    store.onError = () => ui.toast('No se pudo guardar: el almacenamiento del navegador está lleno o bloqueado. Exportá un respaldo.', true);

    resetVehicleForm();
    renderAll();
    resetForm();
    const hash = (root.location.hash || '').slice(1);
    ui.showView(hash || 'inicio');
  }

  init();
})(window);
