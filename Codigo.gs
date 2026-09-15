/**
 * Tropical Experts Costa Rica — Órdenes de reserva y pago con Tilopay
 * -------------------------------------------------------------------
 * Google Apps Script vinculado a una hoja de cálculo. Hace cinco cosas:
 *   1. Asigna un número de orden consecutivo (TECR-750, TECR-751, …)
 *   2. Recalcula el precio con el tarifario (Tarifas.gs): el navegador no manda el precio que vale
 *   3. Anota cada reserva en la hoja "Órdenes"
 *   4. Crea la página de pago segura en Tilopay y devuelve su URL a la página web
 *   5. Al volver el cliente de Tilopay, verifica el pago con Tilopay y envía el comprobante (PDF)
 *
 * Archivos del proyecto: Codigo.gs (este), Tarifas.gs y Logo.gs (los genera build.py).
 * Cómo activarlo: ver GUIA-ORDENES.md.
 * Las claves de Tilopay NO van en este archivo: se guardan una sola vez con guardarClavesTilopay().
 */

const CONFIG = {
  PREFIJO:        "TECR",
  PRIMER_NUMERO:  750,                              // la primera orden será TECR-750
  CORREO_EMPRESA: "tropicalexpertscr@gmail.com",
  NOMBRE_EMPRESA: "Tropical Experts Costa Rica",
  PROPIETARIO:    "Carlos Johnnson Paniagua Berrocal",   // nombre completo como aparece en la cédula
  CEDULA:         "4-0188-0497",                    // sale en el comprobante; vacío = no se imprime
  LEMA:           "Su viaje, nuestra responsabilidad",
  WHATSAPP:       "+506 8486 7057",
  TELEFONO2:      "+506 8762 4779",
  WHATSAPP_LINK:  "https://wa.me/50684867057",
  LICENCIA:       "Licencia I.C.T. #3946-2025",
  LUGAR:          "La Fortuna, San Carlos, Alajuela, Costa Rica",
  WEB:            "tropicalexpertscostarica.com",
  // OJO: esta es la página a la que Tilopay devuelve al cliente después de pagar.
  // TIENE que ser la dirección REAL donde esté publicado el sitio HOY.
  // Ahora: Vercel. Cuando mueva el dominio propio al sitio nuevo, cámbiela por
  // "https://www.tropicalexpertscostarica.com/gracias" y vuelva a implementar.
  URL_GRACIAS:    "https://tropicalexperts.vercel.app/gracias",
  HOJA:           "Órdenes",
  // Debe ser IGUAL a CFG.ordenes.clave en index.html. Si alguien intenta mandar
  // órdenes falsas sin esta clave, el servicio las rechaza.
  CLAVE:          "tecr-2026-cr",
  // Tope de seguridad: máximo de órdenes que se aceptan en 10 minutos.
  MAX_POR_10MIN:  12,
  TILOPAY: {
    ACTIVO:   false,      // true cuando ya guardó las claves con guardarClavesTilopay()
    CAPTURA:  "1",        // 1 = cobra de una vez; 0 = solo autoriza (no recomendado)
    MONEDA:   "USD"
  },
  COLOR_ORO:      "#C6A15B",
  COLOR_NEGRO:    "#0B0A09"
};

/* ───────────────────────── Claves de Tilopay (se guardan una sola vez) ─────────────────────────
   1) Entre a admin.tilopay.com → Tilopay Checkout y copie el usuario del API, la contraseña y la key.
   2) Péguelos abajo entre comillas, ejecute esta función UNA vez desde el editor (▶ Ejecutar).
   3) Borre los valores de aquí, deje las comillas vacías y guarde. Las claves quedan en las
      propiedades del proyecto, no en el código (así nunca se suben a GitHub).
   4) Ponga CONFIG.TILOPAY.ACTIVO = true y vuelva a implementar (Implementar → Administrar → Editar → Nueva versión). */
function guardarClavesTilopay() {
  const usuario = "";   // API user   (ej. "aB3dE9...")
  const clave   = "";   // API password
  const key     = "";   // Key de integración (ej. "1234-5678-9012-3456-7890")
  if (!usuario || !clave || !key) throw new Error("Pegue usuario, contraseña y key de Tilopay antes de ejecutar.");
  PropertiesService.getScriptProperties().setProperties({ TILOPAY_USER: usuario, TILOPAY_PASSWORD: clave, TILOPAY_KEY: key });
  PropertiesService.getScriptProperties().deleteProperty("TILOPAY_TOKEN");
  Logger.log("Claves de Tilopay guardadas. Ahora borre los valores del código y ponga TILOPAY.ACTIVO = true.");
}
function tilopayActivo_() {
  const p = PropertiesService.getScriptProperties();
  return !!(CONFIG.TILOPAY.ACTIVO && p.getProperty("TILOPAY_USER") && p.getProperty("TILOPAY_PASSWORD") && p.getProperty("TILOPAY_KEY"));
}

/* ───────────────────────── Entradas web ───────────────────────── */

// GET: sin parámetros muestra que el servicio está vivo. Con ?accion=confirmar u ?accion=pagar
// atiende a la página gracias.html (verificar el pago / generar un nuevo enlace).
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.accion) return json_({ ok: true, servicio: "ordenes " + CONFIG.NOMBRE_EMPRESA, ultimo: ultimoNumero_(), tilopay: tilopayActivo_() });
  if (CONFIG.CLAVE && p.clave !== CONFIG.CLAVE) return json_({ ok: false, error: "No autorizado" });
  if (demasiadas_()) return json_({ ok: false, error: "Demasiadas solicitudes seguidas." });
  const orden = txt_(p.orden, 20).toUpperCase();
  if (!/^[A-Z]{2,6}-\d{1,8}$/.test(orden)) return json_({ ok: false, error: "Orden inválida" });

  if (p.accion === "confirmar") {
    // Se confirma SOLO con lo que dice Tilopay, nunca con lo que trae la URL de retorno.
    try { return json_(confirmarPago_(orden)); }
    catch (err) { return json_({ ok: false, error: String(err) }); }
  }
  if (p.accion === "pagar") {
    if (!tilopayActivo_()) return json_({ ok: false, error: "Pago en línea no disponible" });
    const fila = buscarOrden_(orden);
    if (!fila || String(fila.datos.correo).toLowerCase() !== txt_(p.correo, 160).toLowerCase()) return json_({ ok: false, error: "Orden no encontrada" });
    if (fila.estado.indexOf("Pagada") === 0) return json_({ ok: false, error: "Esta orden ya está pagada" });
    try {
      const url = crearPagoTilopay_(orden, fila.datos);
      hoja_().getRange(fila.fila, COL.ENLACE).setValue(url);
      return json_({ ok: true, orden: orden, pagoUrl: url });
    } catch (err) { return json_({ ok: false, error: String(err) }); }
  }
  return json_({ ok: false, error: "Acción desconocida" });
}

// La página web envía aquí cada reserva (POST con JSON).
function doPost(e) {
  let datos;
  try { datos = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: "JSON inválido" }); }

  if (!datos || !datos.nombre || !datos.correo || !Array.isArray(datos.viajes) || !datos.viajes.length) {
    return json_({ ok: false, error: "Faltan datos de la reserva" });
  }
  // Clave compartida con la página: sin ella no se crea ninguna orden.
  if (CONFIG.CLAVE && datos.clave !== CONFIG.CLAVE) return json_({ ok: false, error: "No autorizado" });
  // Correo con forma válida (evita basura automática).
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(datos.correo))) return json_({ ok: false, error: "Correo inválido" });
  // Tope de órdenes por rato: si se pasa, se rechaza sin gastar correos.
  if (demasiadas_()) return json_({ ok: false, error: "Demasiadas solicitudes seguidas. Intente en unos minutos." });

  // Se limpia todo lo que viene de afuera y se recalcula el precio con el tarifario.
  datos = sanear_(datos);
  if (!datos.viajes.length) return json_({ ok: false, error: "Faltan datos de la reserva" });
  verificarPrecios_(datos);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let orden;
  try {
    const n = ultimoNumero_() + 1;
    PropertiesService.getScriptProperties().setProperty("ultimo", String(n));
    orden = CONFIG.PREFIJO + "-" + n;
    guardarEnHoja_(orden, datos);
  } finally {
    lock.releaseLock();
  }

  // Pago con tarjeta: se crea la página segura de Tilopay y se devuelve su URL.
  let pagoUrl = "";
  if (datos.pagar && tilopayActivo_()) {
    try {
      pagoUrl = crearPagoTilopay_(orden, datos);
      actualizarOrden_(orden, { estado: "Pendiente de pago · Tilopay", enlace: pagoUrl });
    } catch (err) { anotar_(orden, "Tilopay no respondió al crear el pago: " + err); }
  }

  try { enviarCorreosOrden_(orden, datos, pagoUrl); }
  catch (err) { anotar_(orden, "Error al enviar correo: " + err); }

  return json_({ ok: true, orden: orden, pagoUrl: pagoUrl });
}

/* ───────────────────────── Saneamiento de la entrada ───────────────────────── */

function txt_(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max || 200);
}
function num_(v, max) {
  const n = Number(v); if (!isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n * 100) / 100, max || 99999);
}
function sanear_(d) {
  const s = {
    idioma:   txt_(d.idioma, 2) === "en" ? "en" : "es",
    nombre:   txt_(d.nombre, 120),
    correo:   txt_(d.correo, 160),
    whatsapp: txt_(d.whatsapp, 40),
    pais:     txt_(d.pais, 2).toUpperCase().replace(/[^A-Z]/g, ""),
    codigoPostal: txt_(d.codigoPostal, 12),
    notas:    txt_(d.notas, 1500),
    adultos:  Math.min(Math.round(num_(d.adultos, 40)), 40),
    ninos:    Math.min(Math.round(num_(d.ninos, 40)), 40),
    sillasTexto:    txt_(d.sillasTexto, 200),
    sillasTexto_en: txt_(d.sillasTexto_en, 200),
    total:    num_(d.total, 100000),
    pagar:    d.pagar === true,
    terminos: d.terminos === true,
    web:      txt_(d.web, 80),
    viajes:   (Array.isArray(d.viajes) ? d.viajes : []).slice(0, 12).map(v => ({
      origen: txt_(v.origen, 80), destino: txt_(v.destino, 80),
      origen_en: txt_(v.origen_en, 80), destino_en: txt_(v.destino_en, 80),
      origen_k: txt_(v.origen_k, 80), destino_k: txt_(v.destino_k, 80),
      veh: /^(staria|hiace|maxus)$/.test(String(v.veh)) ? String(v.veh) : "",
      tier: String(v.tier) === "vip" ? "vip" : "std",
      fecha: txt_(v.fecha, 20), hora: txt_(v.hora, 10),
      vehiculo: txt_(v.vehiculo, 60), capacidad: txt_(v.capacidad, 20),
      pax: Math.min(Math.round(num_(v.pax, 40)), 40),
      recogida: txt_(v.recogida, 200), entrega: txt_(v.entrega, 200), vuelo: txt_(v.vuelo, 30),
      servicio: txt_(v.servicio, 40), servicio_en: txt_(v.servicio_en, 40),
      horasExtra: Math.min(Math.round(num_(v.horasExtra, 8)), 8),
      total: num_(v.total, 100000)
    })).filter(v => v.origen && v.destino)
  };
  s.pax = s.adultos + s.ninos;
  return s;
}

/* El precio que vale es el del tarifario (Tarifas.gs), no el que calculó el navegador del cliente.
   Si un tramo no está en el tarifario (ruta especial), se respeta el monto enviado y se anota. */
function verificarPrecios_(d) {
  const IDX = { staria: 0, hiace: 1, maxus: 2 };
  let total = 0, corregido = false, sinTarifa = false;
  d.viajes.forEach(v => {
    const t = (typeof tarifa_ === "function" && v.origen_k && v.destino_k) ? tarifa_(v.origen_k, v.destino_k) : null;
    if (t && v.veh) {
      const horas = Math.min(v.horasExtra, TARIFAS_MAX_HORAS);
      const bueno = t[IDX[v.veh]] + (v.tier === "vip" ? TARIFAS_VIP : 0) + horas * TARIFAS_HORA_EXTRA;
      if (Math.abs(bueno - v.total) > 0.5) { corregido = true; v.totalCliente = v.total; v.total = bueno; }
      v.horasExtra = horas;
    } else sinTarifa = true;
    total += v.total;
  });
  if (Math.abs(total - d.total) > 0.5) { corregido = true; d.totalCliente = d.total; d.total = total; }
  d.precioCorregido = corregido;
  d.rutaEspecial = sinTarifa;
}

/* ───────────────────────── Freno contra abusos ───────────────────────── */

// Cuenta las solicitudes de los últimos 10 minutos. Si pasan del tope, se frena.
function demasiadas_() {
  const cache = CacheService.getScriptCache();
  const n = parseInt(cache.get("ordenes10") || "0", 10) + 1;
  cache.put("ordenes10", String(n), 600);          // 600 s = 10 minutos
  return n > CONFIG.MAX_POR_10MIN;
}

/* ───────────────────────── Utilidades del consecutivo ───────────────────────── */

function ultimoNumero_() {
  const v = PropertiesService.getScriptProperties().getProperty("ultimo");
  return v ? parseInt(v, 10) : CONFIG.PRIMER_NUMERO - 1;
}

// Ejecute esta función a mano solo si quiere volver a empezar en TECR-750.
function reiniciarConsecutivo() {
  PropertiesService.getScriptProperties().setProperty("ultimo", String(CONFIG.PRIMER_NUMERO - 1));
  Logger.log("Listo: la próxima orden será " + CONFIG.PREFIJO + "-" + CONFIG.PRIMER_NUMERO);
}

/* ───────────────────────── Tilopay ───────────────────────── */

const TILOPAY_API = "https://app.tilopay.com/api/v1/";

function tilopayProps_() {
  const p = PropertiesService.getScriptProperties();
  return { user: p.getProperty("TILOPAY_USER"), pass: p.getProperty("TILOPAY_PASSWORD"), key: p.getProperty("TILOPAY_KEY") };
}
// Token del API (dura 24 h): se guarda con su hora de vencimiento y se renueva solo.
function tilopayToken_() {
  const p = PropertiesService.getScriptProperties();
  try {
    const g = JSON.parse(p.getProperty("TILOPAY_TOKEN") || "null");
    if (g && g.token && g.vence > Date.now() + 60000) return g.token;
  } catch (e) {}
  const c = tilopayProps_();
  const r = tilopayPost_("login", { apiuser: c.user, password: c.pass }, null);
  if (!r.access_token) throw new Error("Tilopay no entregó token: " + JSON.stringify(r).slice(0, 200));
  p.setProperty("TILOPAY_TOKEN", JSON.stringify({ token: r.access_token, vence: Date.now() + (Number(r.expires_in) || 3600) * 1000 - 300000 }));
  return r.access_token;
}
function tilopayPost_(ruta, cuerpo, token) {
  const opt = { method: "post", contentType: "application/json", payload: JSON.stringify(cuerpo), muteHttpExceptions: true,
                headers: token ? { Authorization: "bearer " + token } : {} };
  const res = UrlFetchApp.fetch(TILOPAY_API + ruta, opt);
  const txt = res.getContentText();
  let j; try { j = JSON.parse(txt); } catch (e) { throw new Error("Respuesta rara de Tilopay (" + res.getResponseCode() + "): " + txt.slice(0, 200)); }
  if (res.getResponseCode() === 401 && token) { PropertiesService.getScriptProperties().deleteProperty("TILOPAY_TOKEN"); }
  return j;
}

// Crea la página de pago para una orden y devuelve la URL a la que hay que llevar al cliente.
function crearPagoTilopay_(orden, d) {
  const c = tilopayProps_();
  const partes = d.nombre.split(/\s+/), nombre = partes.shift() || "Cliente", apellido = partes.join(" ") || "Cliente";
  const primer = d.viajes[0] || {};
  const pais = /^[A-Z]{2}$/.test(d.pais) ? d.pais : "CR";
  const retorno = JSON.stringify({ o: orden, l: d.idioma || "es" });
  const cuerpo = {
    redirect: CONFIG.URL_GRACIAS,
    key: c.key,
    amount: Number(d.total).toFixed(2),
    currency: CONFIG.TILOPAY.MONEDA,
    orderNumber: orden,
    capture: CONFIG.TILOPAY.CAPTURA,
    billToFirstName: nombre.slice(0, 60), billToLastName: apellido.slice(0, 60),
    billToAddress: (primer.recogida || "N/A").slice(0, 100), billToAddress2: "",
    billToCity: (primer.origen || "N/A").slice(0, 60), billToState: pais === "CR" ? "CR-A" : pais,
    billToZipPostCode: (d.codigoPostal || "10101").slice(0, 12), billToCountry: pais,
    billToTelephone: (d.whatsapp || CONFIG.WHATSAPP).replace(/[^\d+]/g, "").slice(0, 20), billToEmail: d.correo,
    shipToFirstName: nombre.slice(0, 60), shipToLastName: apellido.slice(0, 60),
    shipToAddress: (primer.entrega || primer.recogida || "N/A").slice(0, 100), shipToAddress2: "",
    shipToCity: (primer.destino || "N/A").slice(0, 60), shipToState: pais === "CR" ? "CR-A" : pais,
    shipToZipPostCode: (d.codigoPostal || "10101").slice(0, 12), shipToCountry: pais,
    shipToTelephone: (d.whatsapp || CONFIG.WHATSAPP).replace(/[^\d+]/g, "").slice(0, 20),
    subscription: "0",
    platform: "tropicalexperts-web",
    returnData: Utilities.base64EncodeWebSafe(retorno),
    hashVersion: "V2",
    token_version: "v2"
  };
  const r = tilopayPost_("processPayment", cuerpo, tilopayToken_());
  if (!r.url) throw new Error("Tilopay no devolvió URL de pago: " + JSON.stringify(r).slice(0, 300));
  return r.url;
}

// Pregunta a Tilopay por una orden. Devuelve null si no hay transacción, o {aprobado, auth, tx, tarjeta, monto, fecha}.
function consultarTilopay_(orden) {
  const c = tilopayProps_();
  const r = tilopayPost_("consult", { key: c.key, orderNumber: orden }, tilopayToken_());
  const lista = Array.isArray(r.response) ? r.response : (r.response ? [r.response] : []);
  if (!lista.length) return null;
  // Si hubo varios intentos, vale el aprobado; si ninguno, el último.
  const ok = lista.filter(t => String(t.code) === "1");
  const t = ok.length ? ok[ok.length - 1] : lista[lista.length - 1];
  return { aprobado: String(t.code) === "1", auth: t.auth || "", tx: String(t.id_tilopay || t.id || ""),
           tarjeta: [t.card, t.last ? "···· " + t.last : ""].filter(String).join(" "), monto: t.amount || "", moneda: t.currency || "", fecha: t.date || "" };
}

// Verifica el pago de una orden directamente con Tilopay; si está aprobado y aún no se había
// marcado, la pasa a "Pagada" y envía el comprobante. Es seguro llamarla varias veces.
function confirmarPago_(orden) {
  const fila = buscarOrden_(orden);
  if (!fila) return { ok: false, error: "Orden no encontrada" };
  if (fila.estado.indexOf("Pagada") === 0) return { ok: true, orden: orden, estado: "pagada" };
  if (!tilopayActivo_()) return { ok: true, orden: orden, estado: "pendiente" };
  const t = consultarTilopay_(orden);
  if (!t) return { ok: true, orden: orden, estado: "pendiente" };
  if (!t.aprobado) { actualizarOrden_(orden, { estado: "Pago rechazado · Tilopay", obs: "Último intento rechazado " + t.fecha }); return { ok: true, orden: orden, estado: "rechazada" }; }
  const montoBien = !t.monto || Math.abs(Number(t.monto) - Number(fila.datos.total)) < 0.5;
  const pago = { auth: t.auth, tx: t.tx, tarjeta: t.tarjeta, monto: t.monto || fila.datos.total, moneda: t.moneda || "USD", fecha: t.fecha || new Date().toISOString() };
  actualizarOrden_(orden, { estado: "Pagada · Tilopay", pago: pago,
                             obs: (montoBien ? "" : "OJO: Tilopay cobró $" + t.monto + " y la orden es de $" + fila.datos.total + ". ") + "Aut. " + t.auth + " · Tx " + t.tx });
  try { enviarCorreosPago_(orden, fila.datos, pago); } catch (err) { anotar_(orden, "Error al enviar comprobante: " + err); }
  return { ok: true, orden: orden, estado: "pagada" };
}

// OPCIONAL: cree un activador de tiempo (Activadores → cada hora) para esta función.
// Revisa las órdenes pendientes de Tilopay de los últimos 3 días por si el cliente pagó
// pero cerró el navegador antes de volver a la página de gracias.
function revisarPagosPendientes() {
  if (!tilopayActivo_()) return;
  const h = hoja_(), n = h.getLastRow(); if (n < 2) return;
  const filas = h.getRange(2, 1, n - 1, ENCABEZADOS.length).getValues();
  const desde = Date.now() - 3 * 86400000;
  filas.forEach(f => {
    const estado = String(f[COL.ESTADO - 1] || ""), creada = new Date(f[COL.CREADA - 1]).getTime();
    if (estado.indexOf("Pendiente de pago · Tilopay") === 0 && creada > desde) {
      try { confirmarPago_(String(f[COL.ORDEN - 1])); } catch (e) { Logger.log(f[0] + ": " + e); }
    }
  });
}

/* ───────────────────────── Hoja de cálculo ───────────────────────── */

const ENCABEZADOS = ["Orden", "Creada", "Nombre", "Correo", "WhatsApp", "Viajes", "Fecha 1er viaje",
                     "Total USD", "Pasajeros", "Sillas para niños", "Vuelos", "Notas", "Idioma",
                     "Estado", "Enlace de pago", "Pago (Tilopay)", "Observaciones", "Datos (JSON)"];
const COL = { ORDEN: 1, CREADA: 2, ESTADO: 14, ENLACE: 15, PAGO: 16, OBS: 17, JSON: 18 };

function hoja_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let h = ss.getSheetByName(CONFIG.HOJA);
  if (!h) {
    h = ss.insertSheet(CONFIG.HOJA);
    h.appendRow(ENCABEZADOS);
    h.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight("bold").setBackground(CONFIG.COLOR_NEGRO).setFontColor(CONFIG.COLOR_ORO);
    h.setFrozenRows(1);
    h.setColumnWidths(1, ENCABEZADOS.length, 140);
    h.setColumnWidth(6, 360);
    h.setColumnWidth(COL.JSON, 60);
  }
  return h;
}

function guardarEnHoja_(orden, d) {
  const viajes = d.viajes.map((v, i) =>
    (i + 1) + ") " + v.origen + " → " + v.destino + " · " + v.fecha + " " + v.hora + " · " + v.vehiculo +
    " · " + v.servicio + (v.horasExtra ? " · +" + v.horasExtra + " h" : "") + " · $" + v.total +
    "\n     Recogida: " + (v.recogida || "—") + "\n     Destino: " + (v.entrega || "—") +
    (v.vuelo ? "\n     Vuelo: " + v.vuelo : "")
  ).join("\n");
  const vuelos = d.viajes.map(v => v.vuelo).filter(String).join(" · ");
  const pax = (d.adultos || 0) + " adultos" + (d.ninos ? " · " + d.ninos + " niños" : "");
  const obs = [];
  if (d.precioCorregido) obs.push("Precio recalculado con el tarifario (el navegador envió $" + d.totalCliente + ").");
  if (d.rutaEspecial) obs.push("Incluye un tramo fuera del tarifario: revisar precio.");
  if (!d.terminos) obs.push("No marcó la casilla de términos.");
  hoja_().appendRow([
    orden, new Date(), d.nombre, d.correo, d.whatsapp || "", viajes, d.viajes[0].fecha,
    Number(d.total) || 0, pax, d.sillasTexto || "—", vuelos || "", d.notas || "",
    d.idioma || "es", "Pendiente de pago", "", "", obs.join(" "), JSON.stringify(d)
  ]);
}

function buscarOrden_(orden) {
  const h = hoja_(), n = h.getLastRow(); if (n < 2) return null;
  const col = h.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < col.length; i++) {
    if (String(col[i][0]) === orden) {
      const f = h.getRange(i + 2, 1, 1, ENCABEZADOS.length).getValues()[0];
      let datos = null; try { datos = JSON.parse(f[COL.JSON - 1]); } catch (e) {}
      if (!datos) return null;
      return { fila: i + 2, estado: String(f[COL.ESTADO - 1] || ""), enlace: String(f[COL.ENLACE - 1] || ""), datos: datos };
    }
  }
  return null;
}

function actualizarOrden_(orden, cambios) {
  const f = buscarOrden_(orden); if (!f) return;
  const h = hoja_();
  if (cambios.estado) h.getRange(f.fila, COL.ESTADO).setValue(cambios.estado);
  if (cambios.enlace) h.getRange(f.fila, COL.ENLACE).setValue(cambios.enlace);
  if (cambios.pago) h.getRange(f.fila, COL.PAGO).setValue("Aut. " + cambios.pago.auth + " · Tx " + cambios.pago.tx + " · " + cambios.pago.tarjeta + " · $" + cambios.pago.monto + " · " + cambios.pago.fecha);
  if (cambios.obs) { const c = h.getRange(f.fila, COL.OBS); c.setValue([String(c.getValue() || ""), cambios.obs].filter(String).join(" | ")); }
}
function anotar_(orden, texto) { actualizarOrden_(orden, { obs: texto }); }

/* ───────────────────────── Correos y PDF ───────────────────────── */

function pdf_(orden, d, en, pago) {
  return Utilities.newBlob(documentoHtml_(orden, d, en, pago), MimeType.HTML, orden + ".html")
                  .getAs(MimeType.PDF).setName(orden + " - " + CONFIG.NOMBRE_EMPRESA + ".pdf");
}

// Al crear la orden: al cliente (con botón de pago si hay Tilopay) y copia a la empresa.
function enviarCorreosOrden_(orden, d, pagoUrl) {
  const en = (d.idioma || "es") === "en";
  const pdf = pdf_(orden, d, en, null);
  MailApp.sendEmail({
    to: d.correo, replyTo: CONFIG.CORREO_EMPRESA, name: CONFIG.NOMBRE_EMPRESA,
    subject: (en ? "Your order " : "Su orden ") + orden + (en ? " — pending payment" : " — pendiente de pago") + " · " + CONFIG.NOMBRE_EMPRESA,
    htmlBody: correoClienteHtml_(orden, d, en, pagoUrl, null),
    attachments: [pdf]
  });
  MailApp.sendEmail({
    to: CONFIG.CORREO_EMPRESA, replyTo: d.correo, name: "Reservas " + CONFIG.NOMBRE_EMPRESA,
    subject: "Nueva orden " + orden + " — " + d.nombre + " — $" + d.total + (pagoUrl ? " (pagando en Tilopay)" : ""),
    htmlBody: correoEmpresaHtml_(orden, d, pagoUrl, null),
    attachments: [pdf]
  });
}

// Al confirmarse el pago: comprobante al cliente y aviso a la empresa.
function enviarCorreosPago_(orden, d, pago) {
  const en = (d.idioma || "es") === "en";
  const pdf = pdf_(orden, d, en, pago);
  MailApp.sendEmail({
    to: d.correo, replyTo: CONFIG.CORREO_EMPRESA, name: CONFIG.NOMBRE_EMPRESA,
    subject: (en ? "Booking confirmed " : "Reserva confirmada ") + orden + " · " + CONFIG.NOMBRE_EMPRESA,
    htmlBody: correoClienteHtml_(orden, d, en, "", pago),
    attachments: [pdf]
  });
  MailApp.sendEmail({
    to: CONFIG.CORREO_EMPRESA, replyTo: d.correo, name: "Reservas " + CONFIG.NOMBRE_EMPRESA,
    subject: "PAGADA " + orden + " — " + d.nombre + " — $" + pago.monto,
    htmlBody: correoEmpresaHtml_(orden, d, "", pago),
    attachments: [pdf]
  });
}

function botonHtml_(url, texto) {
  return '<p style="margin:18px 0"><a href="' + esc_(url) + '" style="display:inline-block;background:' + CONFIG.COLOR_ORO + ';color:' + CONFIG.COLOR_NEGRO +
         ';padding:13px 26px;text-decoration:none;font-weight:bold;letter-spacing:.06em;border-radius:3px">' + texto + '</a></p>';
}

function correoClienteHtml_(orden, d, en, pagoUrl, pago) {
  const primer = esc_(d.nombre.split(" ")[0]);
  const total = "$" + d.total + " USD";
  let t;
  if (pago) {
    t = en ? {
      hola: "Hello " + primer + ",",
      p1: "Your payment was approved and your booking <b>" + orden + "</b> is confirmed. Your booking voucher is attached as a PDF — please keep it.",
      p2: "<b>Payment:</b> " + total + " by card through Tilopay · authorisation " + esc_(pago.auth) + " · transaction " + esc_(pago.tx) + ". The charge appears on your statement as " + CONFIG.NOMBRE_EMPRESA + ".",
      p3: "<b>What happens next:</b> the day before your trip we send you your driver's name, the vehicle plate and the exact meeting point by WhatsApp or email. We track your flight: if it is delayed, we adjust at no charge.",
      cierre: "Any question, reply to this email or write to us on WhatsApp " + CONFIG.WHATSAPP + ". Free cancellation up to 48 hours before pick-up.",
      firma: CONFIG.PROPIETARIO + " · Founder"
    } : {
      hola: "Hola " + primer + ",",
      p1: "Su pago fue aprobado y su reserva <b>" + orden + "</b> queda confirmada. Le adjuntamos el comprobante de reserva en PDF: guárdelo.",
      p2: "<b>Pago:</b> " + total + " con tarjeta por medio de Tilopay · autorización " + esc_(pago.auth) + " · transacción " + esc_(pago.tx) + ". El cargo aparece en su estado de cuenta a nombre de " + CONFIG.NOMBRE_EMPRESA + ".",
      p3: "<b>Qué sigue:</b> el día antes del viaje le enviamos por WhatsApp o correo el nombre de su conductor, la placa del vehículo y el punto exacto de encuentro. Monitoreamos su vuelo: si se atrasa, ajustamos sin cargo.",
      cierre: "Cualquier consulta, responda a este correo o escríbanos por WhatsApp al " + CONFIG.WHATSAPP + ". Cancelación gratuita hasta 48 horas antes de la recogida.",
      firma: CONFIG.PROPIETARIO + " · Fundador"
    };
  } else {
    t = en ? {
      hola: "Hello " + primer + ",",
      p1: "Thank you for booking with " + CONFIG.NOMBRE_EMPRESA + ". Your order number is <b>" + orden + "</b>. The order document is attached as a PDF.",
      p2: pagoUrl
        ? "<b>To confirm your booking</b>, pay the full amount (<b>" + total + "</b>) by card on Tilopay's secure page. If you already paid, ignore this button: your confirmation and voucher arrive in a separate email."
        : "<b>What happens next:</b> we will send you a secure payment link for the full amount (<b>" + total + "</b>) by WhatsApp or email. Once paid, your booking is confirmed and you receive your voucher.",
      p3: "Free cancellation up to 48 hours before pick-up. If your flight is delayed, we adjust at no charge — just keep us posted.",
      cierre: "Any question, reply to this email or write to us on WhatsApp " + CONFIG.WHATSAPP + ".",
      firma: CONFIG.PROPIETARIO + " · Founder"
    } : {
      hola: "Hola " + primer + ",",
      p1: "Gracias por reservar con " + CONFIG.NOMBRE_EMPRESA + ". Su número de orden es <b>" + orden + "</b>. Le adjuntamos el documento de la orden en PDF.",
      p2: pagoUrl
        ? "<b>Para confirmar su reserva</b>, pague el total (<b>" + total + "</b>) con tarjeta en la página segura de Tilopay. Si ya pagó, ignore este botón: la confirmación y el comprobante le llegan en otro correo."
        : "<b>Qué sigue:</b> le enviaremos un enlace de pago seguro por el total del viaje (<b>" + total + "</b>) por WhatsApp o correo. Con el pago, su reserva queda confirmada y recibe su comprobante.",
      p3: "Cancelación gratuita hasta 48 horas antes de la recogida. Si su vuelo se atrasa, ajustamos sin costo: solo manténganos al tanto.",
      cierre: "Cualquier consulta, responda a este correo o escríbanos por WhatsApp al " + CONFIG.WHATSAPP + ".",
      firma: CONFIG.PROPIETARIO + " · Fundador"
    };
  }
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:600px;line-height:1.55">' +
    '<div style="background:' + CONFIG.COLOR_NEGRO + ';padding:18px 22px;border-bottom:3px solid ' + CONFIG.COLOR_ORO + '">' +
    '<div style="color:' + CONFIG.COLOR_ORO + ';font-size:18px;letter-spacing:.04em"><b>' + CONFIG.NOMBRE_EMPRESA + '</b></div>' +
    '<div style="color:#bbb;font-size:12px">' + (en ? "Private transfers · " : "Traslados privados · ") + CONFIG.LICENCIA + '</div></div>' +
    '<div style="padding:22px">' +
    '<p>' + t.hola + '</p><p>' + t.p1 + '</p>' +
    '<p style="background:#f6f1e7;border-left:4px solid ' + CONFIG.COLOR_ORO + ';padding:12px 14px">' + t.p2 + '</p>' +
    (pagoUrl && !pago ? botonHtml_(pagoUrl, en ? "PAY " + total + " SECURELY" : "PAGAR " + total + " DE FORMA SEGURA") : "") +
    resumenViajesHtml_(d, en) +
    '<p>' + t.p3 + '</p><p>' + t.cierre + '</p>' +
    '<p style="margin-top:26px">' + t.firma + '<br><b>' + CONFIG.NOMBRE_EMPRESA + '</b><br>' +
    '<a href="' + CONFIG.WHATSAPP_LINK + '">' + CONFIG.WHATSAPP + '</a> · ' + CONFIG.CORREO_EMPRESA + '</p>' +
    '</div></div>';
}

function correoEmpresaHtml_(orden, d, pagoUrl, pago) {
  let aviso;
  if (pago) {
    aviso = '<p style="color:#0b5d2a;background:#e8f7ec;padding:10px 12px;border-left:4px solid #2e9e57"><b>PAGADA por Tilopay.</b> Autorización ' + esc_(pago.auth) +
            ' · transacción ' + esc_(pago.tx) + ' · ' + esc_(pago.tarjeta) + ' · $' + esc_(pago.monto) + '. Ya se le envió el comprobante al cliente. Un día antes del viaje: mandarle conductor, placa y punto de encuentro.</p>';
  } else if (pagoUrl) {
    aviso = '<p style="color:#5a4a00;background:#fff6e0;padding:10px 12px;border-left:4px solid #e0a020"><b>El cliente está pagando en Tilopay.</b> Cuando el pago se apruebe, la orden pasa sola a "Pagada" en la hoja y le llega otro correo con el comprobante. Si en unas horas sigue pendiente, escríbale: puede pagar con el mismo enlace del correo que recibió.</p>';
  } else {
    aviso = '<p><b>Pendiente:</b> enviarle al cliente el enlace de pago por <b>$' + d.total + ' USD</b> y anotar el estado en la hoja "' + CONFIG.HOJA + '".</p>';
  }
  if (d.precioCorregido) aviso += '<p style="color:#8a5a00;background:#fff6e0;padding:10px 12px;border-left:4px solid #e0a020"><b>Ojo:</b> el navegador del cliente envió $' + esc_(d.totalCliente) + '; el servicio recalculó el total con el tarifario y quedó en <b>$' + d.total + '</b>.</p>';
  if (d.rutaEspecial) aviso += '<p style="color:#8a5a00;background:#fff6e0;padding:10px 12px;border-left:4px solid #e0a020"><b>Ojo:</b> hay un tramo fuera del tarifario; revise el precio antes de confirmar.</p>';
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#222;max-width:640px;line-height:1.55">' +
    '<h2 style="color:' + CONFIG.COLOR_ORO + ';margin:0 0 6px">' + (pago ? "Orden pagada " : "Nueva orden ") + orden + '</h2>' +
    '<p style="margin:0 0 14px;color:#666">Creada desde la página web · ' + new Date().toLocaleString("es-CR", { timeZone: "America/Costa_Rica" }) + '</p>' +
    '<table style="border-collapse:collapse;font-size:14px">' +
    fila_("Cliente", d.nombre) + fila_("Correo", d.correo) + fila_("WhatsApp", d.whatsapp || "—") +
    fila_("País / C.P. tarjeta", (d.pais || "—") + " / " + (d.codigoPostal || "—")) +
    fila_("Pasajeros", d.adultos + " adultos" + (d.ninos ? " · " + d.ninos + " niños" : "")) +
    fila_("Sillas para niños", d.sillasTexto || "—") +
    fila_("Vuelos", d.viajes.map(v => v.vuelo).filter(String).join(" · ") || "—") +
    fila_("Notas", d.notas || "—") + fila_("Idioma", d.idioma === "en" ? "Inglés" : "Español") +
    fila_("Aceptó términos", d.terminos ? "Sí" : "No") +
    '</table>' +
    resumenViajesHtml_(d, false) + aviso +
    '<p><a href="' + CONFIG.WHATSAPP_LINK.replace("50684867057", limpiarTel_(d.whatsapp)) + '">Escribirle por WhatsApp</a></p>' +
    '</div>';
}

function resumenViajesHtml_(d, en) {
  let h = '<table style="border-collapse:collapse;width:100%;font-size:14px;margin:16px 0">' +
    '<tr style="background:' + CONFIG.COLOR_NEGRO + ';color:' + CONFIG.COLOR_ORO + '">' +
    '<th style="padding:8px;text-align:left">' + (en ? "Trip" : "Viaje") + '</th>' +
    '<th style="padding:8px;text-align:left">' + (en ? "Date · time" : "Fecha · hora") + '</th>' +
    '<th style="padding:8px;text-align:left">' + (en ? "Vehicle · service" : "Vehículo · servicio") + '</th>' +
    '<th style="padding:8px;text-align:right">USD</th></tr>';
  d.viajes.forEach(v => {
    h += '<tr style="border-bottom:1px solid #ddd">' +
      '<td style="padding:8px">' + esc_(en ? v.origen_en || v.origen : v.origen) + ' → ' + esc_(en ? v.destino_en || v.destino : v.destino) + '</td>' +
      '<td style="padding:8px">' + esc_(v.fecha) + ' · ' + esc_(v.hora) + '</td>' +
      '<td style="padding:8px">' + esc_(v.vehiculo) + ' · ' + v.pax + ' pax · ' + esc_(en ? v.servicio_en || v.servicio : v.servicio) +
      (v.horasExtra ? ' · +' + v.horasExtra + ' h' : '') + '</td>' +
      '<td style="padding:8px;text-align:right">$' + v.total + '</td></tr>';
    h += '<tr style="border-bottom:1px solid #ddd"><td colspan="4" style="padding:2px 8px 9px;font-size:12px;color:#555">' +
      (en ? 'Pick-up: ' : 'Recogida: ') + esc_(v.recogida || '—') +
      ' &nbsp;·&nbsp; ' + (en ? 'Drop-off: ' : 'Destino: ') + esc_(v.entrega || '—') +
      (v.vuelo ? ' &nbsp;·&nbsp; ' + (en ? 'Flight: ' : 'Vuelo: ') + esc_(v.vuelo) : '') +
      '</td></tr>';
  });
  h += '<tr><td colspan="3" style="padding:10px 8px;text-align:right"><b>Total</b></td>' +
       '<td style="padding:10px 8px;text-align:right;font-size:16px"><b>$' + d.total + '</b></td></tr></table>';
  const sillas = esc_(en ? (d.sillasTexto_en || d.sillasTexto || '—') : (d.sillasTexto || '—'));
  if (d.adultos || d.ninos || (sillas && sillas !== '—')) {
    h += '<p style="font-size:13px;color:#333;margin:0 0 12px">' +
      '<b>' + (en ? 'Passengers' : 'Pasajeros') + ':</b> ' + (d.adultos || 0) + (en ? ' adults' : ' adultos') +
      (d.ninos ? ' · ' + d.ninos + (en ? ' children' : ' niños') : '') +
      ' &nbsp;·&nbsp; <b>' + (en ? 'Child seats' : 'Sillas para niños') + ':</b> ' + sillas + '</p>';
  }
  return h;
}

/* El documento de la orden / comprobante de reserva (se convierte a PDF).
   Con `pago` es el COMPROBANTE DE RESERVA (pagada); sin él, la ORDEN DE RESERVA (pendiente).
   Estilos sencillos: el conversor no admite fuentes web. */
function documentoHtml_(orden, d, en, pago) {
  const fecha = new Date().toLocaleDateString(en ? "en-US" : "es-CR", { timeZone: "America/Costa_Rica", year: "numeric", month: "long", day: "numeric" });
  const T = en ? {
    doc: pago ? "BOOKING VOUCHER" : "BOOKING ORDER", cliente: "Customer", correo: "Email", wa: "WhatsApp", vuelo: "Flight", notas: "Hotel and notes",
    pax: "Passengers", sillas: "Child seats",
    pago: "Payment", pagoTxt: "Full amount in advance, by card on Tilopay's secure platform or by the payment link that " + CONFIG.NOMBRE_EMPRESA + " sends to the customer. The price shown is the final price: taxes, fuel, tolls, full-cover insurance, WiFi, water and child seats included. Nothing is paid to the driver.",
    pagado: "PAID", pagoDet: "Paid by card through Tilopay",
    incluye: "Every private transfer includes", incl: ["Door-to-door service, private vehicle for your group only", "Professional driver, flight tracking and free waiting if your flight is delayed (guaranteed bilingual driver on Tropical Experts VIP)", "Full-cover insurance, taxes and tolls included", "Child seats, water and onboard WiFi"],
    cancel: "Cancellation", cancelTxt: "Free up to 48 hours before pick-up, with a full refund to the same card. Within 48 hours there is no refund, except for a documented flight cancellation. No-shows are non-refundable.",
    estado: "Status", estadoTxt: pago ? "Paid and confirmed. The day before your trip we send you the driver's name, the vehicle plate and the meeting point." : "Pending payment — the booking is confirmed once the payment is approved.",
    emitida: "Issued on", gracias: "Thank you for travelling with the tropical experts.",
    empresa: "Service provider", rep: "Represented by", ced: "ID", nota: "This voucher is proof of booking and payment; it is not an electronic invoice (issued separately under Costa Rican tax rules)."
  } : {
    doc: pago ? "COMPROBANTE DE RESERVA" : "ORDEN DE RESERVA", cliente: "Cliente", correo: "Correo", wa: "WhatsApp", vuelo: "Vuelo", notas: "Hotel y notas",
    pax: "Pasajeros", sillas: "Sillas para niños",
    pago: "Pago", pagoTxt: "Total por adelantado, con tarjeta en la plataforma segura de Tilopay o mediante el enlace de pago que " + CONFIG.NOMBRE_EMPRESA + " envía al cliente. El precio mostrado es el precio final: incluye impuestos, combustible, peajes, seguro full cover, WiFi, agua y sillas para niños. No se paga nada al conductor.",
    pagado: "PAGADA", pagoDet: "Pagado con tarjeta por medio de Tilopay",
    incluye: "Todo traslado privado incluye", incl: ["Servicio puerta a puerta, vehículo privado solo para su grupo", "Chofer profesional, monitoreo del vuelo y espera sin costo si se atrasa (chofer bilingüe garantizado en Tropical Experts VIP)", "Seguro full cover, impuestos y peajes incluidos", "Sillas para niños, agua y WiFi a bordo"],
    cancel: "Cancelación", cancelTxt: "Gratuita hasta 48 horas antes de la recogida, con devolución completa a la misma tarjeta. Dentro de las 48 horas no hay devolución, salvo cancelación de vuelo comprobada. No presentarse no tiene devolución.",
    estado: "Estado", estadoTxt: pago ? "Pagada y confirmada. El día antes del viaje le enviamos el nombre del conductor, la placa del vehículo y el punto de encuentro." : "Pendiente de pago — la reserva queda confirmada al aprobarse el pago.",
    emitida: "Emitida el", gracias: "Gracias por viajar con los expertos tropicales.",
    empresa: "Prestador del servicio", rep: "Representada por", ced: "Cédula", nota: "Este comprobante acredita la reserva y su pago; no es factura electrónica (se emite por separado conforme a la normativa de Hacienda)."
  };
  const c = CONFIG;
  const logo = (typeof LOGO_B64 === "string" && LOGO_B64) ? '<img src="' + LOGO_B64 + '" style="width:64px;height:auto" alt="">' : "";
  const sillas = en ? (d.sillasTexto_en || d.sillasTexto || "—") : (d.sillasTexto || "—");
  const paxTxt = (d.adultos || 0) + (en ? " adults" : " adultos") + (d.ninos ? " · " + d.ninos + (en ? " children" : " niños") : "");
  const sello = pago ? '<div class="sello">' + T.pagado + '</div>' : "";
  const pagoBloque = pago
    ? '<table class="datos"><tr><td>' + T.pago + '</td><td><b>' + T.pagoDet + '</b> · $' + esc_(pago.monto) + ' ' + esc_(pago.moneda) +
      (pago.tarjeta ? ' · ' + esc_(pago.tarjeta) : '') + '</td></tr>' +
      '<tr><td>' + (en ? "Authorisation" : "Autorización") + '</td><td>' + esc_(pago.auth || "—") + '</td></tr>' +
      '<tr><td>' + (en ? "Transaction" : "Transacción") + '</td><td>' + esc_(pago.tx || "—") + ' · ' + esc_(pago.fecha || "") + '</td></tr></table>'
    : '<p style="margin:0">' + T.pagoTxt + '</p>';
  return '<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;font-size:12px;margin:0}' +
    '.cab{background:' + c.COLOR_NEGRO + ';color:#fff;padding:18px 28px;border-bottom:4px solid ' + c.COLOR_ORO + '}' +
    '.cab table{width:100%}.cab td{vertical-align:middle}' +
    '.cab h1{margin:0;font-size:20px;color:' + c.COLOR_ORO + ';letter-spacing:.06em}' +
    '.cab .lema{font-size:11px;color:#cfc7b8;margin-top:2px}' +
    '.cab .emp{font-size:10.5px;color:#cfc7b8;text-align:right;line-height:1.5}' +
    '.cuerpo{padding:22px 28px}' +
    '.titulo{width:100%;border-bottom:1px solid #ddd;margin-bottom:16px}.titulo td{padding:0 0 10px;vertical-align:bottom}' +
    '.titulo h2{margin:0;font-size:16px;letter-spacing:.12em;color:#444}' +
    '.num{font-size:26px;color:' + c.COLOR_ORO + ';font-weight:bold}' +
    '.sello{display:inline-block;border:3px solid #2e9e57;color:#2e9e57;font-weight:bold;font-size:15px;letter-spacing:.2em;padding:4px 12px;margin-top:6px}' +
    'table{border-collapse:collapse;width:100%}' +
    '.datos td{padding:4px 6px;vertical-align:top}.datos td:first-child{color:#777;width:120px}' +
    '.viajes th{background:' + c.COLOR_NEGRO + ';color:' + c.COLOR_ORO + ';padding:7px 8px;text-align:left;font-size:11px;letter-spacing:.06em}' +
    '.viajes td{padding:8px;border-bottom:1px solid #e3e3e3}' +
    '.total td{padding:10px 8px;font-size:15px;font-weight:bold}' +
    'h3{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:' + c.COLOR_ORO + ';margin:18px 0 6px}' +
    'ul{margin:4px 0 0 16px;padding:0}li{margin:2px 0}' +
    '.pie{margin-top:22px;border-top:1px solid #ddd;padding-top:10px;font-size:10px;color:#777;line-height:1.5}' +
    '</style></head><body>' +
    '<div class="cab"><table><tr><td style="width:74px">' + logo + '</td>' +
    '<td><h1>' + c.NOMBRE_EMPRESA.toUpperCase() + '</h1><div class="lema">' + c.LEMA + ' · ' + c.LICENCIA + '</div></td>' +
    '<td class="emp">' + T.rep + ' <b>' + c.PROPIETARIO + '</b>' + (c.CEDULA ? '<br>' + T.ced + ' ' + esc_(c.CEDULA) : '') +
    '<br>' + c.WHATSAPP + ' · ' + c.TELEFONO2 + '<br>' + c.CORREO_EMPRESA + '<br>' + c.LUGAR + '</td></tr></table></div>' +
    '<div class="cuerpo">' +
    '<table class="titulo"><tr><td><h2>' + T.doc + '</h2>' + sello + '</td><td style="text-align:right"><div class="num">' + orden + '</div><div style="font-size:11px;color:#777">' + T.emitida + ' ' + fecha + '</div></td></tr></table>' +
    '<table class="datos">' +
    '<tr><td>' + T.cliente + '</td><td><b>' + esc_(d.nombre) + '</b></td></tr>' +
    '<tr><td>' + T.correo + '</td><td>' + esc_(d.correo) + '</td></tr>' +
    '<tr><td>' + T.wa + '</td><td>' + esc_(d.whatsapp || "—") + '</td></tr>' +
    '<tr><td>' + T.pax + '</td><td>' + esc_(paxTxt) + ' · ' + T.sillas + ': ' + esc_(sillas) + '</td></tr>' +
    '<tr><td>' + T.vuelo + '</td><td>' + esc_(d.viajes.map(v => v.vuelo).filter(String).join(" · ") || "—") + '</td></tr>' +
    '<tr><td>' + T.notas + '</td><td>' + esc_(d.notas || "—") + '</td></tr>' +
    '</table>' +
    resumenViajesHtml_(d, en).replace('<table style="border-collapse:collapse;width:100%;font-size:14px;margin:16px 0">', '<table class="viajes" style="margin:16px 0">')
                             .replace(/<p style="font-size:13px[\s\S]*?<\/p>/, '') +   // pasajeros ya van arriba
    '<h3>' + T.pago + '</h3>' + pagoBloque +
    '<h3>' + T.estado + '</h3><p style="margin:0">' + T.estadoTxt + '</p>' +
    '<h3>' + T.incluye + '</h3><ul>' + T.incl.map(x => '<li>' + x + '</li>').join('') + '</ul>' +
    '<h3>' + T.cancel + '</h3><p style="margin:0">' + T.cancelTxt + '</p>' +
    '<div class="pie"><b>' + T.empresa + ':</b> ' + c.NOMBRE_EMPRESA + ' · ' + T.rep.toLowerCase() + ' ' + c.PROPIETARIO + (c.CEDULA ? ' · ' + T.ced + ' ' + esc_(c.CEDULA) : '') +
    ' · ' + c.LICENCIA + '<br>' + c.WHATSAPP + ' · ' + c.TELEFONO2 + ' · ' + c.CORREO_EMPRESA + ' · ' + c.WEB + ' · ' + c.LUGAR + '<br>' + T.nota + '<br>' + T.gracias + '</div>' +
    '</div></body></html>';
}

/* ───────────────────────── Pruebas ───────────────────────── */

function muestra_() {
  return {
    idioma: "es", nombre: "Ana Rodríguez (prueba)", correo: CONFIG.CORREO_EMPRESA, whatsapp: "+506 8888 8888",
    pais: "US", codigoPostal: "33101", notas: "Hotel Los Lagos — 1 silla de bebé", terminos: true, pagar: true,
    viajes: [{ origen: "SJO · Aeropuerto San José", destino: "La Fortuna · Arenal", origen_en: "SJO · San José Airport", destino_en: "La Fortuna · Arenal",
               origen_k: "SJO", destino_k: "La Fortuna", veh: "staria", tier: "vip",
               fecha: "2026-12-10", hora: "09:00", vehiculo: "Hyundai Staria", pax: 3, servicio: "Tropical Experts VIP", servicio_en: "Tropical Experts VIP", horasExtra: 0, total: 300,
               recogida: "Aeropuerto SJO, salida de llegadas", entrega: "Hotel Arenal Springs", vuelo: "AA 1234" }],
    adultos: 2, ninos: 1, sillasTexto: "1 booster (4–12 años)", sillasTexto_en: "1 booster (4–12 yrs)", clave: CONFIG.CLAVE,
    total: 300, moneda: "USD"
  };
}

// Ejecute esta función una vez desde el editor: autoriza el script, crea la hoja "Órdenes"
// y le manda a usted dos correos de muestra (orden pendiente y comprobante pagado) con el PDF.
// NO consume un número del consecutivo ni toca Tilopay.
function probar() {
  hoja_();
  const m = sanear_(muestra_()); verificarPrecios_(m);
  const o = CONFIG.PREFIJO + "-PRUEBA";
  const pago = { auth: "123456", tx: "987654", tarjeta: "Visa ···· 4242", monto: m.total, moneda: "USD", fecha: new Date().toISOString().slice(0, 19).replace("T", " ") };
  MailApp.sendEmail({ to: CONFIG.CORREO_EMPRESA, name: CONFIG.NOMBRE_EMPRESA, subject: "Prueba 1/2 · orden pendiente " + o,
    htmlBody: correoClienteHtml_(o, m, false, "https://securepayment.tilopay.com/ejemplo", null), attachments: [pdf_(o, m, false, null)] });
  MailApp.sendEmail({ to: CONFIG.CORREO_EMPRESA, name: CONFIG.NOMBRE_EMPRESA, subject: "Prueba 2/2 · comprobante pagado " + o,
    htmlBody: correoClienteHtml_(o, m, false, "", pago), attachments: [pdf_(o, m, false, pago)] });
  Logger.log("Dos correos de prueba enviados a " + CONFIG.CORREO_EMPRESA + ". Total recalculado: $" + m.total + ". Próxima orden real: " + CONFIG.PREFIJO + "-" + (ultimoNumero_() + 1));
}

// Prueba la conexión con Tilopay sin crear ninguna orden: pide el token y lo confirma.
function probarTilopay() {
  if (!tilopayActivo_()) throw new Error("Primero guarde las claves con guardarClavesTilopay() y ponga TILOPAY.ACTIVO = true.");
  PropertiesService.getScriptProperties().deleteProperty("TILOPAY_TOKEN");
  const t = tilopayToken_();
  Logger.log("Conexión con Tilopay correcta. Token recibido (" + t.slice(0, 12) + "…).");
}

/* ───────────────────────── Ayudantes ───────────────────────── */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fila_(k, v) { return '<tr><td style="padding:4px 10px 4px 0;color:#777">' + k + '</td><td style="padding:4px 0">' + esc_(String(v)) + '</td></tr>'; }
function esc_(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function limpiarTel_(t) { const d = String(t || "").replace(/\D/g, ""); return d.length === 8 ? "506" + d : d || "50684867057"; }
