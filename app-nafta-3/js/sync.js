/* Cuentas, familia y sincronización con Supabase (REST, sin SDK).
 *
 * - Cada persona tiene su usuario (email + contraseña) en Supabase Auth.
 * - Un administrador crea la familia e invita con un código.
 * - Los datos se sincronizan registro por registro: se sube lo propio que cambió y se
 *   baja lo nuevo (por número de secuencia del servidor). Si dos editan lo mismo, gana la
 *   edición más reciente. Sin internet la app sigue funcionando y sincroniza al volver.
 */
(function (root) {
  'use strict';
  const CF = root.CF;
  const K = { cfg: 'nafta3_config', ses: 'nafta3_session', meta: 'nafta3_syncmeta', fam: 'nafta3_family' };
  const rd = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const wr = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } };

  const fileCfg = root.NAFTA_CONFIG || {};
  const stored = rd(K.cfg) || {};
  let cfg = { url: fileCfg.supabaseUrl || stored.url || '', key: fileCfg.supabaseKey || stored.key || '', fromFile: !!(fileCfg.supabaseUrl && fileCfg.supabaseKey) };
  let session = rd(K.ses);
  let meta = rd(K.meta) || { lastSeq: 0, familyId: null };
  let family = session ? rd(K.fam) : null, familyChecked = !!family;   // familia en caché: sirve sin internet
  let sync = { state: 'idle', msg: '', at: null };
  let busy = false, again = false, started = false, debounce = null;
  const listeners = [];

  function emit() { const st = api.getState(); listeners.forEach((fn) => { try { fn(st); } catch (e) { console.error(e); } }); }
  function setSync(state, msg) { sync = { state: state, msg: msg || '', at: state === 'ok' ? new Date() : sync.at }; emit(); }
  const configured = () => !!(cfg.url && cfg.key);

  /* ---------- HTTP ---------- */
  async function refresh() {
    if (!session || !session.refresh_token) return false;
    try {
      const r = await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false });
      setSession(r, session.user);
      return true;
    } catch (e) { if (e.status >= 400 && e.status < 500) { session = null; wr(K.ses, null); wr(K.fam, null); family = null; familyChecked = false; emit(); } return false; }
  }
  async function http(path, o) {
    o = o || {};
    if (!configured()) throw new Error('Falta configurar Supabase');
    const headers = { apikey: cfg.key, 'Content-Type': 'application/json' };
    if (o.auth !== false && session) {
      if (session.expires_at - Date.now() < 60000 && !o.noRefresh) await refresh();
      if (session) headers.Authorization = 'Bearer ' + session.access_token;
    } else if (/^eyJ/.test(cfg.key)) headers.Authorization = 'Bearer ' + cfg.key;
    const res = await fetch(cfg.url + path, { method: o.method || 'GET', headers: headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { /* no JSON */ }
    if (!res.ok) {
      const msg = json && (json.msg || json.message || json.error_description || json.error) || ('HTTP ' + res.status);
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return json;
  }
  const rpc = (fn, body) => http('/rest/v1/rpc/' + fn, { method: 'POST', body: body || {} });

  function friendly(e) {
    const m = String(e && e.message || e);
    if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.';
    if (/already registered|already been registered/i.test(m)) return 'Ese email ya tiene cuenta. Ingresá con tu contraseña.';
    if (/Email not confirmed/i.test(m)) return 'Tenés que confirmar tu email (revisá tu correo) y después ingresar.';
    if (/Password should be at least|weak/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Esperá un momento y probá de nuevo.';
    if (e && e.status === 404) return 'Supabase no tiene las funciones de la app. ¿Ejecutaste supabase/setup.sql? (' + m + ')';
    if (e && (e.status === 401 || e.status === 403)) return 'Sin permiso: ' + m;
    if (e instanceof TypeError) return 'No se pudo conectar. Revisá la URL de Supabase y tu conexión.';
    return m;
  }

  function setSession(r, userHint) {
    const u = r.user || userHint || {};
    session = {
      access_token: r.access_token, refresh_token: r.refresh_token,
      expires_at: Date.now() + (Number(r.expires_in) || 3600) * 1000,
      user: { id: u.id, email: u.email, name: (u.user_metadata && u.user_metadata.display_name) || (userHint && userHint.name) || '' }
    };
    wr(K.ses, session);
  }

  /* ---------- Familia ---------- */
  async function loadFamily() {
    family = await rpc('get_my_family');
    familyChecked = true;
    wr(K.fam, family);
    if (family) {
      if (meta.familyId && meta.familyId !== family.id) { CF.store.wipeLocal(); meta = { lastSeq: 0, familyId: family.id }; }
      if (!meta.familyId) meta.familyId = family.id;
      wr(K.meta, meta);
    }
    CF.store.setActor(session && session.user.id);
    emit();
    return family;
  }

  async function afterJoin() {
    await loadFamily();
    CF.store.markAllDirty();   // sube lo que ya tenías cargado en este celular
    meta.lastSeq = 0; wr(K.meta, meta);
    api.syncNow();
  }

  /* ---------- Sincronización ---------- */
  async function syncNow() {
    if (!session || !family) return;
    if (busy) { again = true; return; }
    if (navigator.onLine === false) { setSync('offline', 'Sin conexión. Se sincroniza al volver internet.'); return; }
    busy = true; setSync('syncing');
    try {
      try { await loadFamily(); } catch (e) { /* usa la familia en caché */ }
      if (!family) { busy = false; setSync('idle'); return; }
      // 1) bajar lo nuevo
      let since = Math.max(0, meta.lastSeq - 100);
      for (let guard = 0; guard < 50; guard++) {
        const rows = await http('/rest/v1/records?family_id=eq.' + family.id + '&seq=gt.' + since +
          '&order=seq.asc&limit=1000&select=kind,id,data,deleted,created_by,seq');
        if (!rows.length) break;
        CF.store.applyRows(rows);
        since = rows[rows.length - 1].seq;
        meta.lastSeq = Math.max(meta.lastSeq, since);
        if (rows.length < 1000) break;
      }
      wr(K.meta, meta);
      // 2) subir lo propio
      const d = CF.store.dirtyRows();
      for (let i = 0; i < d.rows.length; i += 200) {
        await rpc('push_records', { p_family: family.id, p_rows: d.rows.slice(i, i + 200) });
      }
      CF.store.clearDirty(d.sent);
      setSync('ok');
    } catch (e) {
      setSync('error', friendly(e));
    } finally {
      busy = false;
      if (again) { again = false; schedule(800); }
    }
  }
  function schedule(ms) { if (!session || !family) return; clearTimeout(debounce); debounce = setTimeout(syncNow, ms == null ? 1500 : ms); }

  function start() {
    if (started) return; started = true;
    CF.store.subscribe((kind) => { if (kind === 'local') schedule(1500); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
    root.addEventListener('online', () => syncNow());
    setInterval(() => { if (!document.hidden) syncNow(); }, 20000);
  }

  /* ---------- API pública ---------- */
  const api = CF.sync = {
    getState() {
      let phase = 'unconfigured';
      if (configured()) phase = !session ? 'signed_out' : !familyChecked ? 'loading' : !family ? 'no_family' : 'ready';
      return { phase: phase, cfg: { url: cfg.url, key: cfg.key, fromFile: cfg.fromFile }, user: session ? session.user : null,
        family: family, members: family ? (family.members || []) : [], sync: sync, isAdmin: !!(family && family.role === 'admin') };
    },
    onChange: (fn) => { listeners.push(fn); },
    friendly: friendly,
    userName(id) {
      if (!id) return '';
      const m = (family && family.members || []).find((x) => x.user_id === id);
      return m ? m.display_name : '';
    },

    configure(url, key) {
      url = String(url || '').trim().replace(/\/+$/, ''); key = String(key || '').trim();
      if (!/^https:\/\/.+/.test(url)) throw new Error('La URL debe empezar con https://');
      if (key.length < 20) throw new Error('La clave pública parece incompleta.');
      cfg = { url: url, key: key, fromFile: false }; wr(K.cfg, { url: url, key: key });
      emit();
    },

    async signUp(name, email, password) {
      try {
        const r = await http('/auth/v1/signup', { method: 'POST', auth: false, body: { email: email, password: password, data: { display_name: name } } });
        if (!r || !r.access_token) return { needsConfirm: true };
        setSession(r, { name: name }); start(); await loadFamily(); if (family) api.syncNow(); return { ok: true };
      } catch (e) { throw new Error(friendly(e)); }
    },
    async signIn(email, password) {
      try {
        const r = await http('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email: email, password: password } });
        setSession(r); start(); await loadFamily(); if (family) api.syncNow(); return { ok: true };
      } catch (e) { throw new Error(friendly(e)); }
    },
    async recover(email) {
      try { await http('/auth/v1/recover', { method: 'POST', auth: false, body: { email: email } }); } catch (e) { throw new Error(friendly(e)); }
    },
    signOut() { session = null; family = null; familyChecked = false; wr(K.ses, null); wr(K.fam, null); CF.store.setActor(null); sync = { state: 'idle', msg: '', at: null }; emit(); },

    async createFamily(name, display) {
      try { const r = await rpc('create_family', { p_name: name, p_display: display }); await afterJoin(); return r; } catch (e) { throw new Error(friendly(e)); }
    },
    async joinFamily(code, display) {
      try { const r = await rpc('join_family', { p_code: code, p_display: display }); await afterJoin(); return r; } catch (e) { throw new Error(friendly(e)); }
    },
    async regenInvite() { try { await rpc('regenerate_invite'); await loadFamily(); } catch (e) { throw new Error(friendly(e)); } },
    async removeMember(uid) { try { await rpc('remove_member', { p_user: uid }); await loadFamily(); } catch (e) { throw new Error(friendly(e)); } },
    async promote(uid) { try { await rpc('promote_admin', { p_user: uid }); await loadFamily(); } catch (e) { throw new Error(friendly(e)); } },
    async leaveFamily() {
      try { await rpc('leave_family'); family = null; wr(K.fam, null); familyChecked = true; meta = { lastSeq: 0, familyId: null }; wr(K.meta, meta); emit(); } catch (e) { throw new Error(friendly(e)); }
    },
    async refreshFamily() { try { await loadFamily(); } catch (e) { setSync('error', friendly(e)); } },

    // Últimos movimientos de la familia (quién agregó, modificó o eliminó qué)
    async activity() {
      try {
        return await http('/rest/v1/records?family_id=eq.' + family.id + '&order=seq.desc&limit=40&select=kind,id,data,deleted,created_by,updated_by,created_at,updated_at');
      } catch (e) { throw new Error(friendly(e)); }
    },

    syncNow: syncNow,
    schedule: schedule
  };

  // Arranque: si ya había sesión, recupera la familia y sincroniza
  if (configured() && session) {
    start();
    CF.store.setActor(session.user.id);
    loadFamily().then(() => { if (family) syncNow(); }).catch((e) => {
      familyChecked = true; setSync(family ? 'offline' : 'error', friendly(e));
    });
  }
})(window);
