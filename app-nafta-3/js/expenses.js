/* Gastos generales de los vehículos (reparaciones, repuestos, neumáticos, lavadero, patente, seguro, VTV…) */
(function (root) {
  'use strict';
  const CF = root.CF, ui = CF.ui, store = CF.store;
  const { esc, fmtNum, fmtMoney, fmtDate, EXPENSE_CATEGORIES, PAY_METHODS, todayISO } = CF;
  const $ = ui.$;
  const S = () => store.get();
  let editingId = null;
  const x = { vehicle: $('#x-vehicle'), cat: $('#x-category'), date: $('#x-date'), amount: $('#x-amount'),
    payer: $('#x-payer'), method: $('#x-method'), note: $('#x-note') };

  function syncChips() {
    ui.syncChips(x.vehicle, $('#chips-x-vehicle'), { dot: true });
    ui.syncChips(x.payer, $('#chips-x-payer'), { blank: 'Sin especificar' });
    $('#x-payer-block').classList.toggle('hidden', S().drivers.length === 0);
  }

  function renderForm() {
    const s = S();
    const has = s.vehicles.length > 0;
    $('#x-empty').classList.toggle('hidden', has);
    $('#expense-form').classList.toggle('hidden', !has);
    ui.fillSelect(x.vehicle, s.vehicles.map((v) => ({ value: v.id, label: v.name })), { value: x.vehicle.value || s.settings.lastVehicleId || '' });
    ui.fillSelect(x.payer, s.drivers.map((d) => ({ value: d.id, label: d.name })), { blank: 'Sin especificar', value: x.payer.value || s.settings.lastDriverId || '' });
    syncChips();
  }

  function renderList() {
    const s = S();
    ui.fillSelect($('#x-flt-vehicle'), s.vehicles.map((v) => ({ value: v.id, label: v.name })), { blank: 'Todos los vehículos' });
    const vf = $('#x-flt-vehicle').value;
    const rows = s.expenses.filter((e) => !vf || e.vehicleId === vf)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
    const total = rows.reduce((a, e) => a + e.amount, 0);
    $('#x-count').textContent = rows.length ? '(' + rows.length + ')' : '';
    $('#x-total').textContent = rows.length ? 'Total: ' + fmtMoney(total) : '';
    const host = $('#x-list');
    if (!rows.length) { host.innerHTML = '<p class="muted">Todavía no registraste gastos.</p>'; return; }
    host.innerHTML = '<ul class="list">' + rows.map((e) => {
      const c = EXPENSE_CATEGORIES[e.category];
      const bits = [fmtDate(e.date), esc(ui.vehicleName(e.vehicleId))];
      if (e.payerId) bits.push('pagó ' + esc(ui.driverName(e.payerId)));
      if (e.method) bits.push(esc(e.method));
      if (e.createdBy && CF.sync.userName(e.createdBy)) bits.push('registró ' + esc(CF.sync.userName(e.createdBy)));
      if (e.note) bits.push(esc(e.note));
      return '<li><div class="info"><strong>' + c.icon + ' ' + c.label + ' · ' + fmtMoney(e.amount) + '</strong><span>' + bits.join(' · ') + '</span></div>' +
        '<div class="actions"><button type="button" class="btn mini" data-action="x-edit" data-id="' + esc(e.id) + '">Editar</button>' +
        '<button type="button" class="btn mini danger" data-action="x-del" data-id="' + esc(e.id) + '">Eliminar</button></div></li>';
    }).join('') + '</ul>';
  }

  function resetForm() {
    editingId = null;
    x.amount.value = ''; x.note.value = ''; x.date.value = todayISO(); x.method.value = ''; x.cat.value = 'reparacion';
    $('#x-title').textContent = 'Nuevo gasto';
    $('#btn-save-expense').textContent = 'Guardar gasto';
    $('#btn-x-cancel').classList.add('hidden');
    syncChips();
  }

  function onSubmit(e) {
    e.preventDefault();
    const v = S().vehicles.find((q) => q.id === x.vehicle.value);
    if (!v) return ui.toast('Elegí un vehículo.', true);
    const amount = CF.num(x.amount.value);
    if (!(amount > 0)) return ui.toast('Ingresá el monto del gasto.', true);
    if (!CF.isISODate(x.date.value)) return ui.toast('Ingresá una fecha válida.', true);
    const old = editingId ? S().expenses.find((q) => q.id === editingId) : null;
    store.upsert('expenses', {
      id: old ? old.id : CF.uid(), vehicleId: v.id, date: x.date.value, category: x.cat.value, amount: amount,
      payerId: x.payer.value || null, method: x.method.value, note: x.note.value.trim(),
      createdBy: old ? old.createdBy : null, createdAt: old ? old.createdAt : Date.now()
    });
    store.setSettings({ lastVehicleId: v.id, lastDriverId: x.payer.value || null });
    ui.toast(old ? 'Gasto actualizado' : 'Gasto guardado');
    resetForm();
    ui.renderAll();
  }

  ui.action('x-edit', (id) => {
    const e = S().expenses.find((q) => q.id === id); if (!e) return;
    editingId = id;
    x.vehicle.value = e.vehicleId; x.cat.value = e.category; x.date.value = e.date; x.amount.value = e.amount;
    x.payer.value = e.payerId || ''; x.method.value = e.method || ''; x.note.value = e.note || '';
    $('#x-title').textContent = 'Editar gasto';
    $('#btn-save-expense').textContent = 'Guardar cambios';
    $('#btn-x-cancel').classList.remove('hidden');
    syncChips();
    $('#expense-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  ui.action('x-del', (id) => {
    const e = S().expenses.find((q) => q.id === id); if (!e) return;
    if (!root.confirm('¿Eliminar el gasto de ' + fmtMoney(e.amount) + ' (' + EXPENSE_CATEGORIES[e.category].label + ') del ' + fmtDate(e.date) + '?')) return;
    store.remove('expenses', id);
    if (editingId === id) resetForm();
    ui.renderAll(); ui.toast('Gasto eliminado');
  });

  x.cat.innerHTML = Object.keys(EXPENSE_CATEGORIES).map((k) => '<option value="' + k + '">' + EXPENSE_CATEGORIES[k].icon + ' ' + esc(EXPENSE_CATEGORIES[k].label) + '</option>').join('');
  x.method.innerHTML = '<option value="">—</option>' + PAY_METHODS.map((m) => '<option>' + esc(m) + '</option>').join('');
  $('#expense-form').addEventListener('submit', onSubmit);
  $('#btn-x-cancel').addEventListener('click', resetForm);
  $('#x-flt-vehicle').addEventListener('change', renderList);
  ui.register(() => { renderForm(); renderList(); });
  resetForm();
})(window);
