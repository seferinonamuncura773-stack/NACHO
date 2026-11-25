/* Pestaña Mantenimiento: registros (aceite, filtros, VTV, seguro…) y alertas por fecha o km */
(function (root) {
  'use strict';
  const CF = root.CF, ui = CF.ui, store = CF.store, calc = CF.calc;
  const { esc, fmtNum, fmtMoney, fmtDate, MAINT_TYPES, todayISO } = CF;
  const $ = ui.$;
  const S = () => store.get();
  const byId = (col, id) => S()[col].find((x) => x.id === id);

  const m = {
    form: $('#maint-form'), vehicle: $('#m-vehicle'), type: $('#m-type'), date: $('#m-date'), odo: $('#m-odo'),
    cost: $('#m-cost'), payer: $('#m-payer'), intKm: $('#m-int-km'), intMonths: $('#m-int-months'), nextDate: $('#m-next-date'),
    nextKm: $('#m-next-km'), note: $('#m-note'), kmHint: $('#m-km-hint')
  };
  let editingId = null;
  const dirty = { date: false, km: false };

  const TYPE_ITEMS = Object.keys(MAINT_TYPES).map((k) => ({ value: k, label: MAINT_TYPES[k].icon + ' ' + MAINT_TYPES[k].label }));

  function typeLabel(t) { return MAINT_TYPES[t].icon + ' ' + MAINT_TYPES[t].label; }

  // Completa "próximo vencimiento" a partir de fecha/km + intervalos (si el usuario no lo tocó)
  function autoNext() {
    const months = CF.num(m.intMonths.value), km = CF.num(m.intKm.value), odo = CF.num(m.odo.value);
    if (!dirty.date) m.nextDate.value = (months > 0 && CF.isISODate(m.date.value)) ? CF.addMonths(m.date.value, Math.round(months)) : '';
    if (!dirty.km) m.nextKm.value = (km > 0 && isFinite(odo)) ? Math.round(odo + km) : '';
  }

  function applyTypeDefaults() {
    const t = MAINT_TYPES[m.type.value];
    m.intKm.value = t.km || '';
    m.intMonths.value = t.months || '';
    dirty.date = dirty.km = false;
    autoNext();
  }

  function updateKmHint() {
    const km = m.vehicle.value ? calc.currentKm(m.vehicle.value, S().fills, S().maint) : null;
    m.kmHint.textContent = km != null ? 'Último km conocido: ' + fmtNum(km, 0) + ' km' : '';
  }

  function resetForm() {
    editingId = null;
    dirty.date = dirty.km = false;
    m.date.value = todayISO(); m.odo.value = ''; m.cost.value = ''; m.note.value = ''; m.payer.value = '';
    $('#maint-form-title').textContent = 'Registrar mantenimiento';
    $('#btn-save-maint').textContent = 'Guardar mantenimiento';
    $('#btn-maint-cancel').classList.add('hidden');
    applyTypeDefaults();
    updateKmHint();
  }

  function onSubmit(e) {
    e.preventDefault();
    const v = byId('vehicles', m.vehicle.value);
    if (!v) return ui.toast('Elegí un vehículo.', true);
    if (!CF.isISODate(m.date.value)) return ui.toast('Ingresá una fecha válida.', true);
    const odo = CF.num(m.odo.value), cost = CF.num(m.cost.value);
    const intKm = CF.num(m.intKm.value), intM = CF.num(m.intMonths.value), nextKm = CF.num(m.nextKm.value);
    const nextDate = CF.isISODate(m.nextDate.value) ? m.nextDate.value : null;
    if (m.nextKm.value !== '' && !isFinite(nextKm)) return ui.toast('El próximo km no es válido.', true);
    if (isFinite(odo) && isFinite(nextKm) && nextKm <= odo) return ui.toast('El próximo km debe ser mayor al km actual.', true);
    if (nextDate && nextDate <= m.date.value) return ui.toast('La fecha de vencimiento debe ser posterior a la del servicio.', true);
    const old = editingId ? byId('maint', editingId) : null;
    store.upsert('maint', {
      id: old ? old.id : CF.uid(), vehicleId: v.id, type: m.type.value, date: m.date.value,
      odo: isFinite(odo) && odo >= 0 ? odo : null, cost: isFinite(cost) && cost >= 0 && m.cost.value !== '' ? cost : null,
      intKm: intKm > 0 ? intKm : null, intMonths: intM > 0 ? intM : null,
      nextDate: nextDate, nextKm: isFinite(nextKm) ? nextKm : null,
      payerId: m.payer.value || null, createdBy: old ? old.createdBy : null,
      note: m.note.value.trim(), createdAt: old ? old.createdAt : Date.now()
    });
    store.setSettings({ lastVehicleId: v.id });
    ui.toast(old ? 'Mantenimiento actualizado' : 'Mantenimiento guardado');
    resetForm();
    ui.renderAll();
  }

  /* ---------- Render ---------- */
  function statusBadge(st) {
    return st === 'overdue' ? '<span class="status overdue">⛔ Vencido</span>'
      : st === 'soon' ? '<span class="status soon">⚠️ Próximo</span>' : '<span class="status ok">✅ Al día</span>';
  }

  function alertDetail(a) {
    const out = [];
    const r = a.record;
    if (a.daysLeft !== null) {
      out.push(a.daysLeft < 0 ? 'Venció el ' + fmtDate(r.nextDate) + ' (hace ' + (-a.daysLeft) + (a.daysLeft === -1 ? ' día)' : ' días)')
        : a.daysLeft === 0 ? 'Vence hoy (' + fmtDate(r.nextDate) + ')'
          : 'Vence el ' + fmtDate(r.nextDate) + ' (en ' + a.daysLeft + (a.daysLeft === 1 ? ' día)' : ' días)'));
    }
    if (r.nextKm != null) {
      if (a.kmLeft === null) out.push('Próximo a los ' + fmtNum(r.nextKm, 0) + ' km');
      else out.push(a.kmLeft <= 0 ? 'Pasado por ' + fmtNum(-a.kmLeft, 0) + ' km (tocaba a los ' + fmtNum(r.nextKm, 0) + ')'
        : 'A los ' + fmtNum(r.nextKm, 0) + ' km (faltan ' + fmtNum(a.kmLeft, 0) + ')');
    }
    return out.join(' · ');
  }

  function alerts() { return calc.maintAlerts(S().maint, S().fills, todayISO()); }

  function renderAlerts() {
    const list = alerts();
    const pending = list.filter((a) => a.status !== 'ok');
    // insignias
    const badge = $('#maint-badge');
    badge.textContent = pending.length; badge.classList.toggle('hidden', !pending.length);
    const banner = $('#maint-banner');
    if (pending.length) {
      const over = pending.filter((a) => a.status === 'overdue').length;
      banner.innerHTML = '<span>' + (over ? '⛔ ' + over + ' mantenimiento' + (over > 1 ? 's' : '') + ' vencido' + (over > 1 ? 's' : '') : '⚠️ ' + pending.length + ' mantenimiento' + (pending.length > 1 ? 's' : '') + ' por vencer') +
        '</span> <button type="button" class="btn mini" data-action="goto" data-id="mantenimiento">Ver</button>';
      banner.classList.remove('hidden');
    } else banner.classList.add('hidden');

    const host = $('#maint-alerts');
    if (!S().vehicles.length) { host.innerHTML = '<p class="muted">Agregá un vehículo en Ajustes para registrar mantenimientos.</p>'; return; }
    if (!list.length) {
      host.innerHTML = '<p class="muted">Sin alertas todavía. Al registrar un mantenimiento, completá la fecha o el km del próximo vencimiento y la app te avisa.</p>';
      return;
    }
    host.innerHTML = '<ul class="list">' + list.map((a) =>
      '<li class="alert-item ' + a.status + '"><div class="info"><strong>' + typeLabel(a.record.type) + ' · ' + esc(ui.vehicleName(a.record.vehicleId)) + '</strong>' +
      '<span>' + alertDetail(a) + '</span></div><div class="actions">' + statusBadge(a.status) +
      (a.status !== 'ok' ? '<button type="button" class="btn mini" data-action="maint-renew" data-id="' + esc(a.record.id) + '">Registrar</button>' : '') +
      '</div></li>').join('') + '</ul>';
  }

  function renderHistory() {
    const s = S();
    ui.fillSelect($('#m-flt-vehicle'), s.vehicles.map((v) => ({ value: v.id, label: v.name })), { blank: 'Todos los vehículos' });
    const vf = $('#m-flt-vehicle').value;
    const rows = s.maint.filter((x) => !vf || x.vehicleId === vf)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
    const host = $('#maint-history');
    if (!rows.length) { host.innerHTML = '<p class="muted">Todavía no hay mantenimientos registrados.</p>'; return; }
    host.innerHTML = '<ul class="list">' + rows.map((x) => {
      const bits = [fmtDate(x.date)];
      if (x.odo != null) bits.push(fmtNum(x.odo, 0) + ' km');
      if (x.cost != null) bits.push(fmtMoney(x.cost));
      if (x.payerId) bits.push('pagó ' + esc(ui.driverName(x.payerId)));
      if (x.createdBy && CF.sync.userName(x.createdBy)) bits.push('registró ' + esc(CF.sync.userName(x.createdBy)));
      const next = [];
      if (x.nextDate) next.push('próx. ' + fmtDate(x.nextDate));
      if (x.nextKm != null) next.push('próx. ' + fmtNum(x.nextKm, 0) + ' km');
      return '<li><div class="info"><strong>' + typeLabel(x.type) + ' · ' + esc(ui.vehicleName(x.vehicleId)) + '</strong>' +
        '<span>' + bits.join(' · ') + (next.length ? ' · ' + next.join(' / ') : '') + (x.note ? ' · ' + esc(x.note) : '') + '</span></div>' +
        '<div class="actions"><button type="button" class="btn mini" data-action="maint-edit" data-id="' + esc(x.id) + '">Editar</button>' +
        '<button type="button" class="btn mini danger" data-action="maint-delete" data-id="' + esc(x.id) + '">Eliminar</button></div></li>';
    }).join('') + '</ul>';
  }

  function renderForm() {
    const s = S();
    $('#maint-form').classList.toggle('hidden', !s.vehicles.length);
    ui.fillSelect(m.payer, s.drivers.map((d) => ({ value: d.id, label: d.name })), { blank: '—' });
    ui.fillSelect(m.vehicle, s.vehicles.map((v) => ({ value: v.id, label: v.name })), { value: m.vehicle.value || s.settings.lastVehicleId || '' });
    updateKmHint();
  }

  /* ---------- Acciones ---------- */
  ui.action('maint-edit', (id) => {
    const x = byId('maint', id); if (!x) return;
    editingId = id;
    m.vehicle.value = x.vehicleId; m.type.value = x.type; m.date.value = x.date;
    m.odo.value = x.odo != null ? x.odo : ''; m.cost.value = x.cost != null ? x.cost : '';
    m.intKm.value = x.intKm || ''; m.intMonths.value = x.intMonths || '';
    m.nextDate.value = x.nextDate || ''; m.nextKm.value = x.nextKm != null ? x.nextKm : '';
    m.note.value = x.note || ''; m.payer.value = x.payerId || '';
    dirty.date = dirty.km = true;
    $('#maint-form-title').textContent = 'Editar mantenimiento';
    $('#btn-save-maint').textContent = 'Guardar cambios';
    $('#btn-maint-cancel').classList.remove('hidden');
    updateKmHint();
    m.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  ui.action('maint-delete', (id) => {
    const x = byId('maint', id); if (!x) return;
    if (!root.confirm('¿Eliminar "' + MAINT_TYPES[x.type].label + '" del ' + fmtDate(x.date) + '?')) return;
    store.remove('maint', id);
    if (editingId === id) resetForm();
    ui.renderAll(); ui.toast('Mantenimiento eliminado');
  });
  // Desde una alerta: precarga el formulario para registrar que ya se hizo
  ui.action('maint-renew', (id) => {
    const x = byId('maint', id); if (!x) return;
    resetForm();
    m.vehicle.value = x.vehicleId; m.type.value = x.type;
    applyTypeDefaults();
    if (x.intKm) m.intKm.value = x.intKm;
    if (x.intMonths) m.intMonths.value = x.intMonths;
    const km = calc.currentKm(x.vehicleId, S().fills, S().maint);
    if (km != null) m.odo.value = km;
    autoNext(); updateKmHint();
    m.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    m.odo.focus();
  });

  ui.register(() => { renderForm(); renderAlerts(); renderHistory(); });

  /* ---------- Init ---------- */
  m.type.innerHTML = TYPE_ITEMS.map((i) => '<option value="' + i.value + '">' + esc(i.label) + '</option>').join('');
  m.form.addEventListener('submit', onSubmit);
  m.type.addEventListener('change', applyTypeDefaults);
  m.vehicle.addEventListener('change', updateKmHint);
  [m.date, m.odo, m.intKm, m.intMonths].forEach((el) => el.addEventListener('input', autoNext));
  m.nextDate.addEventListener('input', (e) => { if (e.isTrusted) dirty.date = m.nextDate.value !== ''; if (!dirty.date) autoNext(); });
  m.nextKm.addEventListener('input', (e) => { if (e.isTrusted) dirty.km = m.nextKm.value !== ''; if (!dirty.km) autoNext(); });
  $('#btn-maint-cancel').addEventListener('click', resetForm);
  $('#m-flt-vehicle').addEventListener('change', renderHistory);
  resetForm();
})(window);
