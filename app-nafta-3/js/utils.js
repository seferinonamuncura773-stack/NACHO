/* Utilidades compartidas: combustibles, formatos es-AR y helpers */
(function (root) {
  'use strict';
  const CF = root.CF = root.CF || {};

  CF.FUELS = {
    super:   { label: 'Súper',                         unit: 'L'  },
    premium: { label: 'Premium (Infinia / V-Power)',   unit: 'L'  },
    diesel:  { label: 'Diesel',                        unit: 'L'  },
    gnc:     { label: 'GNC',                           unit: 'm³' }
  };

  CF.MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
               'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  CF.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  CF.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  CF.todayISO = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  CF.round2 = (n) => Math.round(n * 100) / 100;

  CF.fmtNum = (n, dec) => {
    if (n == null || !isFinite(n)) return '—';
    dec = dec == null ? 2 : dec;
    return Number(n).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };
  CF.fmtMoney = (n) => (n == null || !isFinite(n)) ? '—' : '$ ' + CF.fmtNum(n, 2);

  // "2026-11-23" -> "23/11/2026" (sin pasar por Date para evitar problemas de zona horaria)
  CF.fmtDate = (iso) => {
    const p = String(iso || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : '';
  };

  CF.unitOf = (fuel) => (CF.FUELS[fuel] ? CF.FUELS[fuel].unit : 'L');
  CF.unitWord = (fuel) => (CF.unitOf(fuel) === 'L' ? 'litro' : 'm³');

  CF.num = (v) => {
    if (v === '' || v == null) return NaN;
    return parseFloat(String(v).replace(',', '.'));
  };

  // Tipos de mantenimiento (defKm / defMonths: sugerencia para "repetir cada")
  CF.MAINT = {
    aceite:  { label: 'Cambio de aceite', icon: '🛢️', defKm: 10000, defMonths: 12 },
    filtros: { label: 'Filtros',          icon: '🧰', defKm: 15000, defMonths: 12 },
    vtv:     { label: 'VTV',              icon: '📋', defKm: 0,     defMonths: 12 },
    seguro:  { label: 'Seguro',           icon: '🛡️', defKm: 0,     defMonths: 1  },
    otro:    { label: 'Otro',             icon: '🔧', defKm: 0,     defMonths: 0  }
  };

  const dayNum = (iso) => {
    const p = String(iso).split('-').map(Number);
    return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
  };
  // Días desde aIso hasta bIso (positivo si b es posterior)
  CF.daysBetween = (aIso, bIso) => dayNum(bIso) - dayNum(aIso);
  CF.dayNum = dayNum;

  // Suma meses a una fecha ISO, ajustando el día (31 ene + 1 mes = 28/29 feb)
  CF.addMonths = (iso, n) => {
    const p = iso.split('-').map(Number);
    const total = p[0] * 12 + (p[1] - 1) + n;
    const y = Math.floor(total / 12), m = total % 12;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const d = Math.min(p[2], last);
    return y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  };

  // Gastos generales de un vehículo (además de combustible y mantenimiento)
  CF.EXPENSE_CATEGORIES = {
    reparacion:      { label: 'Reparación',             icon: '🛠️' },
    repuestos:       { label: 'Repuestos',              icon: '🔩' },
    neumaticos:      { label: 'Neumáticos',             icon: '🛞' },
    lavadero:        { label: 'Lavadero',               icon: '🧼' },
    patente:         { label: 'Patente / impuestos',    icon: '🧾' },
    seguro:          { label: 'Seguro',                 icon: '🛡️' },
    vtv:             { label: 'VTV',                    icon: '📋' },
    estacionamiento: { label: 'Estacionamiento / peaje', icon: '🅿️' },
    multas:          { label: 'Multas',                 icon: '🚨' },
    otro:            { label: 'Otro',                   icon: '💸' }
  };
  CF.PAY_METHODS = ['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Mercado Pago', 'Otro'];

  CF.isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  // Tipos de mantenimiento (km / meses = intervalos sugeridos, editables)
  CF.MAINT_TYPES = {
    aceite:             { label: 'Cambio de aceite',      icon: '🛢️', km: 10000, months: 12 },
    filtro_aceite:      { label: 'Filtro de aceite',      icon: '🛢️', km: 10000, months: 12 },
    filtro_aire:        { label: 'Filtro de aire',        icon: '💨', km: 15000, months: 12 },
    filtro_combustible: { label: 'Filtro de combustible', icon: '⛽', km: 20000, months: 24 },
    filtro_habitaculo:  { label: 'Filtro de habitáculo',  icon: '🌬️', km: 15000, months: 12 },
    vtv:                { label: 'VTV',                   icon: '📋', km: 0,     months: 12 },
    seguro:             { label: 'Seguro',                icon: '🛡️', km: 0,     months: 12 },
    neumaticos:         { label: 'Neumáticos',            icon: '🛞', km: 40000, months: 0  },
    frenos:             { label: 'Frenos',                icon: '🛑', km: 30000, months: 12 },
    bateria:            { label: 'Batería',               icon: '🔋', km: 0,     months: 36 },
    distribucion:       { label: 'Distribución',          icon: '⚙️', km: 60000, months: 60 },
    otro:               { label: 'Otro',                  icon: '🔧', km: 0,     months: 0  }
  };

  CF.isISODate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(Date.parse(s));

  // Diferencia en días entre dos fechas ISO (b - a)
  CF.daysBetween = (a, b) => {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  };

  // Suma meses a una fecha ISO (ajusta el día si el mes destino es más corto)
  CF.addMonths = (iso, n) => {
    const p = (x) => String(x).padStart(2, '0');
    const a = iso.split('-').map(Number);
    const t = new Date(Date.UTC(a[0], a[1] - 1 + n, 1));
    const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
    return t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(Math.min(a[2], last));
  };
})(typeof window !== 'undefined' ? window : globalThis);
