/* Familia: integrantes en la nube (administrador/invitaciones), gastos por integrante y actividad */
(function (root) {
  'use strict';
  const CF = root.CF, ui = CF.ui, store = CF.store, calc = CF.calc, sync = CF.sync;
  const { esc, fmtNum, fmtMoney, MONTHS, EXPENSE_CATEGORIES } = CF;
  const $ = ui.$;
  const S = () => store.get();

  /* ---------- Integrantes de la cuenta familiar ---------- */
  function renderMembers() {
    const st = sync.getState(), host = $('#members-panel');
    if (st.phase !== 'ready') {
      host.innerHTML = '<p class="muted">Con una cuenta familiar, cada integrante tiene su usuario y todos ven y cargan los mismos datos desde su celular.</p>' +
        '<button type="button" class="btn primary" data-view="ajustes">Activar cuenta familiar</button>';
      return;
    }
    const f = st.family, me = st.user && st.user.id;
    let h = '<p><strong>' + esc(f.name) + '</strong> <span class="badge">' + (st.isAdmin ? 'Administrador' : 'Integrante') + '</span></p>';
    h += '<ul class="list">' + st.members.map((m) =>
      '<li><div class="info"><strong>' + esc(m.display_name) + (m.user_id === me ? ' (vos)' : '') + '</strong><span>' + (m.role === 'admin' ? 'Administrador' : 'Integrante') + '</span></div>' +
      (st.isAdmin && m.user_id !== me ? '<div class="actions">' + (m.role !== 'admin' ? '<button type="button" class="btn mini" data-action="fam-promote" data-id="' + esc(m.user_id) + '">Hacer admin</button>' : '') +
        '<button type="button" class="btn mini danger" data-action="fam-remove" data-id="' + esc(m.user_id) + '">Quitar</button></div>' : '') + '</li>').join('') + '</ul>';
    if (st.isAdmin && f.invite_code) {
      const link = root.location.origin && root.location.origin !== 'null' ? root.location.origin + root.location.pathname + '?codigo=' + f.invite_code : '';
      h += '<div class="invite"><span class="lbl">Código para invitar</span><div class="invite-code">' + esc(f.invite_code) + '</div>' +
        '<div class="row wrap"><button type="button" class="btn mini" data-action="fam-copy" data-id="' + esc(f.invite_code) + '">Copiar código</button>' +
        (link ? '<button type="button" class="btn mini" data-action="fam-copy" data-id="' + esc(link) + '">Copiar enlace</button>' : '') +
        '<button type="button" class="btn mini" data-action="fam-regen">Generar uno nuevo</button></div>' +
        '<p class="muted small">Cada persona crea su cuenta en la app y, cuando le pide unirse a una familia, ingresa este código. Si lo ves en manos equivocadas, generá uno nuevo.</p></div>';
    }
    h += '<div style="margin-top:10px"><button type="button" class="btn mini danger" data-action="fam-leave">Salir de la familia</button></div>';
    host.innerHTML = h;
  }

  /* ---------- Gastos por integrante ---------- */
  function renderContrib() {
    const s = S(), led = calc.ledger(s);
    const months = Array.from(new Set(led.map((e) => e.date.slice(0, 7)))).sort().reverse();
    const cur = $('#contrib-month').value;
    ui.fillSelect($('#contrib-month'), months.map((k) => ({ value: k, label: MONTHS[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(0, 4) })), { blank: 'Todo el historial', value: cur });
    const mk = $('#contrib-month').value;
    const rows = led.filter((e) => !mk || e.date.slice(0, 7) === mk);
    const by = {};
    rows.forEach((e) => {
      const k = e.payerId || '_none';
      const o = by[k] = by[k] || { total: 0, fuel: 0, maint: 0, other: 0 };
      o.total += e.amount;
      if (e.type === 'fuel') o.fuel += e.amount; else if (e.type === 'maint') o.maint += e.amount; else o.other += e.amount;
    });
    const keys = Object.keys(by).sort((a, b) => by[b].total - by[a].total);
    const all = keys.reduce((a, k) => a + by[k].total, 0);
    $('#contrib-list').innerHTML = keys.length ? '<div class="contrib-total">Total: <b>' + fmtMoney(all) + '</b></div>' + keys.map((k) => {
      const o = by[k], pct = all ? Math.round(o.total / all * 100) : 0;
      return '<div class="bar-row big"><span>' + (k === '_none' ? 'Sin asignar' : esc(ui.driverName(k))) + '</span><b>' + fmtMoney(o.total) + ' <small>(' + pct + '%)</small></b><i style="width:' + Math.max(2, pct) + '%"></i>' +
        '<small class="muted">Combustible ' + fmtMoney(o.fuel) + ' · Mantenimiento ' + fmtMoney(o.maint) + ' · Otros ' + fmtMoney(o.other) + '</small></div>';
    }).join('') : '<p class="muted">Todavía no hay gastos registrados en este período.</p>';
  }

  /* ---------- Actividad ---------- */
  const WHAT = { vehicle: 'un vehículo', driver: 'un integrante', fill: 'una carga', maint: 'un mantenimiento', expense: 'un gasto', deleted: 'un registro' };
  function detail(r) {
    if (r.deleted) return '';
    const d = r.data || {};
    if (r.kind === 'fill') return fmtNum(d.qty, 2) + ' · ' + fmtMoney(d.total);
    if (r.kind === 'expense') return (EXPENSE_CATEGORIES[d.category] ? EXPENSE_CATEGORIES[d.category].label : '') + ' · ' + fmtMoney(d.amount);
    if (r.kind === 'maint') return CF.MAINT_TYPES[d.type] ? CF.MAINT_TYPES[d.type].label : '';
    if (r.kind === 'vehicle' || r.kind === 'driver') return d.name || '';
    return '';
  }
  async function loadActivity() {
    const host = $('#activity-list');
    if (sync.getState().phase !== 'ready') { host.innerHTML = '<p class="muted small">Activá la cuenta familiar en Ajustes para ver la actividad.</p>'; return; }
    host.innerHTML = '<p class="muted small">Cargando…</p>';
    try {
      const rows = await sync.activity();
      host.innerHTML = rows.length ? '<ul class="list">' + rows.map((r) => {
        const who = sync.userName(r.updated_by) || 'Alguien';
        const created = Math.abs(Date.parse(r.updated_at) - Date.parse(r.created_at)) < 3000;
        const verb = r.deleted ? 'eliminó' : created ? 'agregó' : 'modificó';
        return '<li><div class="info"><strong>' + esc(who) + ' ' + verb + ' ' + WHAT[r.kind] + '</strong><span>' +
          new Date(r.updated_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) +
          (detail(r) ? ' · ' + esc(detail(r)) : '') + '</span></div></li>';
      }).join('') + '</ul>' : '<p class="muted small">Todavía no hay actividad.</p>';
    } catch (e) { host.innerHTML = '<p class="muted small">' + esc(e.message) + '</p>'; }
  }

  /* ---------- Acciones ---------- */
  const guard = (fn) => async (id) => { try { await fn(id); } catch (e) { ui.toast(e.message, true); } };
  ui.action('fam-copy', (txt) => {
    const done = () => ui.toast('Copiado');
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => ui.toast(txt));
    else ui.toast(txt);
  });
  ui.action('fam-regen', guard(async () => { if (root.confirm('El código anterior dejará de servir. ¿Generar uno nuevo?')) { await sync.regenInvite(); ui.toast('Código nuevo generado'); } }));
  ui.action('fam-remove', guard(async (id) => { if (root.confirm('¿Quitar a esta persona de la familia? Ya no podrá ver ni cargar datos.')) { await sync.removeMember(id); ui.toast('Integrante quitado'); } }));
  ui.action('fam-promote', guard(async (id) => { if (root.confirm('¿Darle permisos de administrador?')) { await sync.promote(id); ui.toast('Ahora es administrador'); } }));
  ui.action('fam-leave', guard(async () => { if (root.confirm('¿Salir de la familia? Tus datos locales quedan en este celular pero dejan de sincronizarse.')) { await sync.leaveFamily(); ui.toast('Saliste de la familia'); } }));
  ui.action('load-activity', loadActivity);

  $('#contrib-month').addEventListener('change', renderContrib);
  sync.onChange(renderMembers);
  ui.register(() => { renderMembers(); renderContrib(); });
})(window);
