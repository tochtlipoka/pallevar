/**
 * Pa'llevar · Pedidos de la web → Google Sheets + resumen diario para la cocina.
 *
 * Qué hace:
 *  1. doPost(): cada pedido que llega de la web se guarda en la hoja "Pedidos",
 *     una fila por comida, con estado de pago "Pendiente".
 *  2. enviarResumen(): todos los días a las 8:05 pm (hora de Irlanda) junta los
 *     pedidos del día siguiente y manda por correo a la cocina:
 *     producción por turno, guarniciones, lo que hay que quitar, ruta de entrega
 *     y lista de compras (calculada con la hoja "Recetas").
 *  3. setup(): crea las hojas y programa el envío diario. Se corre UNA vez.
 */

const CONFIG = {
  EMAIL_COCINA: 'cocina@ejemplo.com', // ← correo del jefe de cocina
  EMAIL_COPIA: '',                     // ← tu correo, si quieres copia (opcional)
  HORA_CIERRE: 20,                     // 8 pm: cierre de pedidos del día siguiente
  ZONA: 'Europe/Dublin',
  CUPO_TURNO: 30
};

const HOJA_PEDIDOS = 'Pedidos';
const HOJA_RECETAS = 'Recetas';
const HOJA_RESUMENES = 'Resúmenes';
const COLS = ['Recibido', 'Pedido', 'Fecha entrega', 'Platillo', 'Comida #', 'Guarnición 1',
  'Guarnición 2', 'Quitar', 'Turno', 'Hora', 'Lugar', 'Nombre', 'WhatsApp', 'Notas', 'Precio', 'Pago'];

/* ---------------- 1. Recibir pedidos ---------------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const o = JSON.parse(e.postData.contents);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.fechaEntrega) || !Array.isArray(o.comidas) ||
        o.comidas.length < 1 || o.comidas.length > 10 || !o.nombre || !o.whatsapp) {
      return json_({ ok: false, error: 'pedido incompleto' });
    }
    const ahora = new Date();
    const estado = fueraDeHorario_(o.fechaEntrega, ahora) ? 'FUERA DE HORARIO' : 'Pendiente';
    const t = s => String(s || '').slice(0, 300);
    const rows = o.comidas.map((c, i) => [
      ahora, t(o.id), "'" + o.fechaEntrega, t(o.platillo), i + 1,
      t((c.guarniciones || [])[0]), t((c.guarniciones || [])[1]), t((c.sin || []).join(', ')),
      t(o.turno), "'" + t(o.hora), t(o.lugar), t(o.nombre), "'" + t(o.whatsapp), t(o.notas),
      Number(o.precio) || 9.99, estado
    ]);
    const sh = hoja_(HOJA_PEDIDOS, COLS);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, COLS.length).setValues(rows);
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, servicio: "Pa'llevar pedidos" });
}

/* ---------------- 2. Resumen diario para la cocina ---------------- */
function enviarResumen() {
  const manana = Utilities.formatDate(new Date(Date.now() + 864e5), CONFIG.ZONA, 'yyyy-MM-dd');
  const diaTxt = Utilities.formatDate(new Date(Date.now() + 864e5), CONFIG.ZONA, 'EEEE d MMM');
  const sh = hoja_(HOJA_PEDIDOS, COLS);
  const v = sh.getDataRange().getDisplayValues().slice(1);
  const C = Object.fromEntries(COLS.map((c, i) => [c, i]));
  const filas = v.filter(r => r[C['Fecha entrega']] === manana && r[C['Pago']] !== 'Cancelado');
  const validas = filas.filter(r => r[C['Pago']] !== 'FUERA DE HORARIO');
  const tarde = filas.filter(r => r[C['Pago']] === 'FUERA DE HORARIO');

  if (!filas.length) {
    enviar_('Pa\'llevar · Sin pedidos para mañana (' + manana + ')',
      '<p>No llegaron pedidos para mañana ' + manana + '.</p>');
    return;
  }

  const platillo = validas.length ? validas[0][C['Platillo']] : filas[0][C['Platillo']];
  const turnos = ['Mañana', 'Tarde'];
  const contar = (arr, fn) => arr.reduce((m, r) => { const k = fn(r); if (k) m[k] = (m[k] || 0) + 1; return m; }, {});

  // Producción
  const porTurno = contar(validas, r => r[C['Turno']]);
  const guarn = {};
  turnos.forEach(tu => {
    validas.filter(r => r[C['Turno']] === tu).forEach(r => {
      [r[C['Guarnición 1']], r[C['Guarnición 2']]].forEach(g => {
        if (!g) return; guarn[g] = guarn[g] || { 'Mañana': 0, 'Tarde': 0 }; guarn[g][tu]++;
      });
    });
  });
  const quitar = {};
  validas.forEach(r => String(r[C['Quitar']] || '').split(',').map(x => x.trim()).filter(Boolean)
    .forEach(q => { quitar[q] = (quitar[q] || 0) + 1; }));

  // Lista de compras con la hoja Recetas
  const rec = hoja_(HOJA_RECETAS, ['Platillo o guarnición', 'Insumo', 'Cantidad por porción', 'Unidad'])
    .getDataRange().getValues().slice(1);
  const usos = { [platillo]: validas.length };
  Object.keys(guarn).forEach(g => { usos[g] = guarn[g]['Mañana'] + guarn[g]['Tarde']; });
  const compras = {};
  rec.forEach(([quien, insumo, cant, unidad]) => {
    if (!usos[quien] || !insumo) return;
    const k = insumo + '|' + unidad;
    compras[k] = (compras[k] || 0) + usos[quien] * Number(cant || 0);
  });

  // Ruta
  const ruta = turnos.map(tu => {
    const delTurno = validas.filter(r => r[C['Turno']] === tu);
    if (!delTurno.length) return '';
    const lugares = contar(delTurno, r => r[C['Lugar']]);
    return '<h3>' + tu + ' · ' + (delTurno[0][C['Hora']] || '') + '</h3>' +
      Object.keys(lugares).map(l => '<p><b>' + esc_(l) + ' (' + lugares[l] + ')</b><br>' +
        delTurno.filter(r => r[C['Lugar']] === l).map(r =>
          esc_(r[C['Nombre']]) + ' — ' + esc_(r[C['Guarnición 1']]) + ' + ' + esc_(r[C['Guarnición 2']]) +
          (r[C['Quitar']] ? ' · <i>' + esc_(r[C['Quitar']]) + '</i>' : '') +
          (r[C['Pago']] !== 'Pagado' ? ' <span style="color:#B3261E">[' + esc_(r[C['Pago']]) + ']</span>' : '')
        ).join('<br>') + '</p>').join('');
  }).join('');

  const notas = validas.filter(r => r[C['Notas']]).map(r => '<li><b>' + esc_(r[C['Nombre']]) + ':</b> ' + esc_(r[C['Notas']]) + '</li>');
  const pendientes = validas.filter(r => r[C['Pago']] !== 'Pagado').length;
  const tabla = (head, rows) => '<table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd">' +
    '<tr style="background:#0E4D3A;color:#fff">' + head.map(h => '<th align="left">' + h + '</th>').join('') + '</tr>' +
    rows.map(r => '<tr>' + r.map(c => '<td style="border-top:1px solid #eee">' + c + '</td>').join('') + '</tr>').join('') + '</table>';
  const fmt = (n, u) => (u === 'g' && n >= 1000) ? (n / 1000).toFixed(2) + ' kg' : (u === 'ml' && n >= 1000) ? (n / 1000).toFixed(2) + ' l' : Math.round(n * 100) / 100 + ' ' + u;

  const html =
    '<div style="font-family:Arial,sans-serif;color:#1E2622;max-width:680px">' +
    '<h2 style="color:#E0620F">Pa\'llevar · Producción para ' + diaTxt + '</h2>' +
    '<p style="font-size:18px"><b>' + esc_(platillo) + '</b> · ' + validas.length + ' comidas ' +
    '(Mañana: ' + (porTurno['Mañana'] || 0) + ' / Tarde: ' + (porTurno['Tarde'] || 0) + ' · cupo ' + CONFIG.CUPO_TURNO + ' por turno)</p>' +
    (pendientes ? '<p style="color:#B3261E"><b>' + pendientes + ' comidas con pago pendiente.</b> Confirmar antes de cocinar.</p>' : '') +
    '<h3>Guarniciones</h3>' + tabla(['Guarnición', 'Mañana', 'Tarde', 'Total'],
      Object.keys(guarn).map(g => [esc_(g), guarn[g]['Mañana'], guarn[g]['Tarde'], '<b>' + (guarn[g]['Mañana'] + guarn[g]['Tarde']) + '</b>'])) +
    (Object.keys(quitar).length ? '<h3>Quitar</h3>' + tabla(['Indicación', 'Comidas'], Object.keys(quitar).map(q => [esc_(q), quitar[q]])) : '') +
    (notas.length ? '<h3>Notas de clientes</h3><ul>' + notas.join('') + '</ul>' : '') +
    '<h3>Lista de compras</h3>' + (Object.keys(compras).length
      ? tabla(['Insumo', 'Cantidad'], Object.keys(compras).sort().map(k => { const [i, u] = k.split('|'); return [esc_(i), fmt(compras[k], u)]; }))
      : '<p>Llena la hoja "Recetas" para que aquí salga la lista de compras.</p>') +
    '<p>Contenedores + cubiertos + servilletas: <b>' + validas.length + '</b></p>' +
    '<h3>Ruta de entrega</h3>' + ruta +
    (tarde.length ? '<p style="color:#A35A00"><b>' + tarde.length + ' comidas llegaron después del cierre</b> y no están en la producción. Revisar en la hoja.</p>' : '') +
    '</div>';

  enviar_('Pa\'llevar · ' + validas.length + ' comidas para ' + diaTxt + ' (' + platillo + ')', html);
  hoja_(HOJA_RESUMENES, ['Enviado', 'Fecha entrega', 'Platillo', 'Comidas', 'Mañana', 'Tarde', 'Pago pendiente'])
    .appendRow([new Date(), "'" + manana, platillo, validas.length, porTurno['Mañana'] || 0, porTurno['Tarde'] || 0, pendientes]);
}

/* ---------------- 3. Configuración inicial (correr una vez) ---------------- */
function setup() {
  hoja_(HOJA_PEDIDOS, COLS);
  hoja_(HOJA_RESUMENES, ['Enviado', 'Fecha entrega', 'Platillo', 'Comidas', 'Mañana', 'Tarde', 'Pago pendiente']);
  const rec = hoja_(HOJA_RECETAS, ['Platillo o guarnición', 'Insumo', 'Cantidad por porción', 'Unidad']);
  if (rec.getLastRow() < 2) {
    // Cantidades de EJEMPLO. El cocinero las corrige con sus recetas reales.
    const ej = [
      ['Albóndigas en chipotle', 'Carne molida de res', 150, 'g'], ['Albóndigas en chipotle', 'Jitomate', 80, 'g'],
      ['Albóndigas en chipotle', 'Chile chipotle', 5, 'g'], ['Albóndigas en chipotle', 'Pan molido', 15, 'g'], ['Albóndigas en chipotle', 'Huevo', 0.2, 'pz'],
      ['Picadillo', 'Carne molida de res', 130, 'g'], ['Picadillo', 'Papa', 80, 'g'], ['Picadillo', 'Zanahoria', 50, 'g'], ['Picadillo', 'Jitomate', 60, 'g'],
      ['Pollo frito', 'Pollo en piezas', 250, 'g'], ['Pollo frito', 'Harina de trigo', 30, 'g'], ['Pollo frito', 'Aceite', 40, 'ml'],
      ['Sándwich horneado', 'Pan de caja', 2, 'rebanadas'], ['Sándwich horneado', 'Jamón', 60, 'g'], ['Sándwich horneado', 'Queso', 40, 'g'],
      ['Huevos con salchicha', 'Huevo', 2, 'pz'], ['Huevos con salchicha', 'Salchicha', 2, 'pz'], ['Huevos con salchicha', 'Tortilla de harina', 2, 'pz'],
      ['Frijoles', 'Frijol (seco)', 50, 'g'], ['Frijoles', 'Queso fresco', 10, 'g'],
      ['Arroz', 'Arroz', 60, 'g'], ['Arroz', 'Jitomate', 15, 'g'],
      ['Espagueti', 'Espagueti', 70, 'g'], ['Espagueti', 'Crema', 30, 'ml']
    ];
    rec.getRange(2, 1, ej.length, 4).setValues(ej);
  }
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'enviarResumen')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('enviarResumen').timeBased().everyDays(1)
    .atHour(CONFIG.HORA_CIERRE).nearMinute(5).inTimezone(CONFIG.ZONA).create();
}

/* ---------------- utilidades ---------------- */
function hoja_(nombre, encabezados) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.getRange(1, 1, 1, encabezados.length).setValues([encabezados])
      .setFontWeight('bold').setBackground('#0E4D3A').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}
function fueraDeHorario_(fechaEntrega, ahora) {
  const d = new Date(fechaEntrega + 'T12:00:00Z');
  const diaAntes = Utilities.formatDate(new Date(d.getTime() - 864e5), 'UTC', 'yyyy-MM-dd');
  const cierre = diaAntes + ' ' + ('0' + CONFIG.HORA_CIERRE).slice(-2);
  return Utilities.formatDate(ahora, CONFIG.ZONA, 'yyyy-MM-dd HH') >= cierre;
}
function enviar_(asunto, html) {
  const p = { to: CONFIG.EMAIL_COCINA, subject: asunto, htmlBody: html, name: "Pa'llevar" };
  if (CONFIG.EMAIL_COPIA) p.cc = CONFIG.EMAIL_COPIA;
  MailApp.sendEmail(p);
}
function esc_(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
