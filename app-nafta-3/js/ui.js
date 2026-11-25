/* Utilidades de interfaz compartidas: navegación, toast, acciones, descargas */
(function (root) {
  'use strict';
  const CF = root.CF;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const renderers = [];
  const actions = {};
  const VIEWS = ['inicio', 'cargar', 'gastos', 'mantenimiento', 'mas', 'historial', 'vehiculos', 'estadisticas', 'familia', 'ajustes'];
  const NAV_OF = { historial: 'mas', vehiculos: 'mas', estadisticas: 'mas', familia: 'mas', ajustes: 'mas' };
  let current = 'inicio', toastTimer = null;

  const ui = CF.ui = {
    $: $, $$: $$,
    register: (fn) => { renderers.push(fn); },
    renderAll() { renderers.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); },
    action: (name, fn) => { actions[name] = fn; },
    current: () => current,

    showView(name) {
      if (VIEWS.indexOf(name) < 0) name = 'inicio';
      current = name;
      $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
      $$('.bottom-nav [data-view]').forEach((b) => {
        const on = b.dataset.view === (NAV_OF[name] || name);
        b.classList.toggle('active', on);
        if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      });
      try { history.replaceState(null, '', '#' + name); } catch (e) { /* file:// */ }
      root.scrollTo(0, 0);
      document.dispatchEvent(new CustomEvent('cf:view', { detail: name }));
    },

    toast(msg, isError) {
      const t = $('#toast');
      t.textContent = msg;
      t.classList.toggle('error', !!isError);
      t.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 4500 : 2500);
    },

    fillSelect(el, items, opts) {
      opts = opts || {};
      const prev = el.value;
      let html = '';
      if (opts.blank != null) html += '<option value="">' + CF.esc(opts.blank) + '</option>';
      (opts.extra || []).forEach((x) => { html += '<option value="' + CF.esc(x.value) + '">' + CF.esc(x.label) + '</option>'; });
      items.forEach((it) => { html += '<option value="' + CF.esc(it.value) + '">' + CF.esc(it.label) + '</option>'; });
      el.innerHTML = html;
      const want = opts.value != null && opts.value !== '' ? opts.value : prev;
      if (want && Array.prototype.some.call(el.options, (o) => o.value === want)) el.value = want;
    },

    // Botones grandes (tipo "radio") sincronizados con un <select> oculto
    syncChips(select, host, opts) {
      opts = opts || {};
      host.innerHTML = Array.prototype.map.call(select.options, (o) => {
        const on = o.value === select.value;
        const label = o.value === '' ? (opts.blank || 'Sin dato') : o.textContent.split(' · ')[0];
        return '<button type="button" class="chip-btn' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-v="' + CF.esc(o.value) + '">' +
          (opts.dot && o.value ? '<i class="dot" style="background:' + ui.vehicleColor(o.value) + '"></i>' : '') + CF.esc(label) + '</button>';
      }).join('');
      if (!host._bound) {
        host._bound = true;
        host.addEventListener('click', (e) => {
          const b = e.target.closest('.chip-btn');
          if (!b) return;
          select.value = b.dataset.v;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        select.addEventListener('change', () => ui.syncChips(select, host, opts));
      }
    },

    vehicleName(id) { const v = CF.store.get().vehicles.find((x) => x.id === id); return v ? v.name : '(eliminado)'; },
    driverName(id) { const d = id && CF.store.get().drivers.find((x) => x.id === id); return d ? d.name : '—'; },
    vehicleColor(id) {
      const i = CF.store.get().vehicles.findIndex((x) => x.id === id);
      return 'var(--s' + (((i < 0 ? 0 : i) % 8) + 1) + ')';
    },

    download(filename, text, mime) {
      const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  };

  // Navegación inferior y acciones por data-action
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-view]');
    if (nav) { ui.showView(nav.dataset.view); return; }
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el.dataset.id, el);
  });

  ui.action('goto', (id) => ui.showView(id));
})(window);
