/* Ajustes → Cuenta: configuración de Supabase, registro/ingreso y alta o unión a una familia */
(function (root) {
  'use strict';
  const CF = root.CF, ui = CF.ui, sync = CF.sync;
  const { esc } = CF;
  const $ = ui.$;
  let mode = 'login';
  const urlCode = (new URLSearchParams(root.location.search).get('codigo') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (urlCode) mode = 'register';

  function field(label, name, type, extra) {
    return '<label class="field"><span>' + label + '</span><input type="' + (type || 'text') + '" name="' + name + '" ' + (extra || '') + '></label>';
  }

  function render() {
    const st = sync.getState(), host = $('#account-panel');
    // insignia del encabezado
    const badge = $('#sync-badge');
    const b = { syncing: ['🔄', 'Sincronizando…'], ok: ['☁️✓', 'Sincronizado'], offline: ['☁️⚠', 'Sin conexión'], error: ['☁️⚠', 'Error de sincronización'] }[st.sync.state];
    badge.textContent = st.phase === 'ready' && b ? b[0] : ''; badge.title = b ? b[1] : '';
    badge.classList.toggle('hidden', !(st.phase === 'ready' && b));
    if (host.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && st.phase === host.dataset.phase) return; // no pisar lo que están escribiendo
    host.dataset.phase = st.phase;
    let h = '';
    if (st.phase === 'unconfigured') {
      h = '<p class="muted">Para compartir los datos entre celulares hace falta un proyecto gratis en Supabase (pasos en el README). Pegá acá la URL y la clave pública; <b>o</b> dejalas fijas en <code>js/config.js</code> antes de publicar la app.</p>' +
        '<form data-form="cfg" novalidate>' + field('URL del proyecto', 'url', 'url', 'placeholder="https://xxxx.supabase.co" autocapitalize="off" spellcheck="false"') +
        field('Clave pública (anon / publishable)', 'key', 'text', 'placeholder="eyJ… o sb_publishable_…" autocapitalize="off" spellcheck="false"') +
        '<button class="btn primary" type="submit">Guardar</button></form>';
    } else if (st.phase === 'signed_out') {
      h = (urlCode ? '<div class="alert info">👋 Te invitaron a una familia. Creá tu cuenta y vas a poder unirte con el código.</div>' : '') +
        '<div class="seg"><button type="button" class="' + (mode === 'login' ? 'on' : '') + '" data-action="acc-mode" data-id="login">Ingresar</button>' +
        '<button type="button" class="' + (mode === 'register' ? 'on' : '') + '" data-action="acc-mode" data-id="register">Crear cuenta</button></div>' +
        '<form data-form="' + mode + '" novalidate>' + (mode === 'register' ? field('Tu nombre', 'name', 'text', 'placeholder="Ej: Mamá" maxlength="40" autocomplete="name"') : '') +
        field('Email', 'email', 'email', 'autocomplete="email" autocapitalize="off"') +
        field('Contraseña (mínimo 6)', 'password', 'password', 'autocomplete="' + (mode === 'login' ? 'current-password' : 'new-password') + '"') +
        '<button class="btn primary" type="submit">' + (mode === 'login' ? 'Ingresar' : 'Crear cuenta') + '</button>' +
        (mode === 'login' ? ' <button type="button" class="btn text" data-action="acc-recover">Olvidé mi contraseña</button>' : '') + '</form>' +
        (st.cfg.fromFile ? '' : '<p class="small"><button type="button" class="btn text" data-action="acc-cfg">Cambiar datos de Supabase</button></p>');
    } else if (st.phase === 'loading') {
      h = '<p class="muted">Conectando…</p>';
    } else if (st.phase === 'no_family') {
      const nm = (st.user && st.user.name) || '';
      h = '<p>Sesión iniciada como <b>' + esc(st.user.email) + '</b>. Falta un paso: elegí una opción.</p>' +
        '<div class="card inner"><h3>Crear la familia (soy el administrador)</h3><form data-form="create" novalidate>' +
        field('Nombre de la familia', 'family', 'text', 'placeholder="Ej: Familia Molinez" maxlength="40"') +
        field('Tu nombre', 'display', 'text', 'value="' + esc(nm) + '" maxlength="40"') +
        '<button class="btn primary" type="submit">Crear familia</button></form></div>' +
        '<div class="card inner"><h3>Unirme con un código</h3><form data-form="join" novalidate>' +
        field('Código de invitación', 'code', 'text', 'value="' + esc(urlCode) + '" placeholder="Ej: 3F9A1C7B2D" autocapitalize="characters" spellcheck="false"') +
        field('Tu nombre', 'display', 'text', 'value="' + esc(nm) + '" maxlength="40"') +
        '<button class="btn primary" type="submit">Unirme</button></form></div>' +
        '<p class="small"><button type="button" class="btn text" data-action="acc-logout">Cerrar sesión</button></p>';
    } else {
      const ss = st.sync;
      let line = 'Todavía no sincronizó.';
      if (ss.state === 'syncing') line = '🔄 Sincronizando…';
      else if (ss.state === 'ok') line = '✅ Sincronizado a las ' + ss.at.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + '.';
      else if (ss.state === 'offline' || ss.state === 'error') line = '⚠️ ' + ss.msg;
      h = '<p><b>' + esc(st.family.name) + '</b> · ' + (st.isAdmin ? 'Administrador' : 'Integrante') + '<br><span class="muted">Sesión: ' + esc(st.user.email) + '</span></p>' +
        '<div class="alert ' + (ss.state === 'error' || ss.state === 'offline' ? 'warn' : 'info') + '">' + esc(line) + '</div>' +
        '<div class="row wrap"><button type="button" class="btn primary" data-action="acc-sync">Sincronizar ahora</button>' +
        '<button type="button" class="btn" data-view="familia">Ver familia</button>' +
        '<button type="button" class="btn danger" data-action="acc-logout">Cerrar sesión</button></div>' +
        '<p class="muted small">Los datos se guardan primero en este celular y se sincronizan solos al abrir la app, al guardar y cada 20 segundos. Sin internet seguís cargando y se sube al volver.</p>';
    }
    host.innerHTML = h;
  }

  const busy = async (btn, fn) => {
    if (btn) btn.disabled = true;
    try { await fn(); } catch (e) { ui.toast(e.message || String(e), true); } finally { if (btn) btn.disabled = false; }
  };

  $('#account-panel').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target, d = new FormData(form), v = (k) => String(d.get(k) || '').trim();
    const btn = form.querySelector('button[type=submit]');
    busy(btn, async () => {
      switch (form.dataset.form) {
        case 'cfg': sync.configure(v('url'), v('key')); ui.toast('Datos guardados'); break;
        case 'login': await sync.signIn(v('email'), v('password')); ui.toast('Sesión iniciada'); break;
        case 'register': {
          if (!v('name')) throw new Error('Poné tu nombre.');
          const r = await sync.signUp(v('name'), v('email'), v('password'));
          if (r.needsConfirm) { mode = 'login'; render(); ui.toast('Cuenta creada. Confirmá tu email y después ingresá.'); } else ui.toast('Cuenta creada');
          break;
        }
        case 'create': await sync.createFamily(v('family'), v('display')); ui.toast('Familia creada'); break;
        case 'join': await sync.joinFamily(v('code'), v('display')); ui.toast('Te uniste a la familia'); break;
      }
    });
  });

  ui.action('acc-mode', (id) => { mode = id; $('#account-panel').dataset.phase = ''; render(); });
  ui.action('acc-recover', () => {
    const email = (root.prompt('Email de tu cuenta:') || '').trim();
    if (email) busy(null, async () => { await sync.recover(email); ui.toast('Te enviamos un email para cambiar la contraseña'); });
  });
  ui.action('acc-logout', () => { if (root.confirm('¿Cerrar sesión? Los datos quedan en este celular.')) sync.signOut(); });
  ui.action('acc-sync', (id, el) => busy(el, async () => { await sync.syncNow(); }));
  ui.action('acc-cfg', () => { try { localStorage.removeItem('nafta3_config'); } catch (e) { /* nada */ } root.location.reload(); });

  sync.onChange(render);
  ui.register(render);
})(window);
