// api/rates.js — Tropical Experts Costa Rica
// Tipos de cambio para MOSTRAR precios en otras monedas.
// El cobro siempre se hace en dólares; esto es solo referencia para el visitante.
//
// La red de Vercel guarda la respuesta 12 horas, así que a la fuente se le
// consulta dos veces al día como máximo, sin importar cuántas visitas haya.

const MONEDAS = ["EUR", "GBP", "CAD", "MXN", "CHF", "AUD", "CRC"];

// Respaldo si la fuente no responde. Aproximados: la página avisa que son referencia.
const RESPALDO = {
  EUR: 0.86, GBP: 0.75, CAD: 1.37, MXN: 18.4, CHF: 0.80, AUD: 1.52, CRC: 505
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const r = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=" + MONEDAS.join(",")
    );

    if (!r.ok) throw new Error("fuente respondió " + r.status);

    const d = await r.json();
    const tasas = { ...RESPALDO, ...(d.rates || {}) };

    // Frankfurter no cubre el colón costarricense; se mantiene el del respaldo.
    if (!d.rates || !d.rates.CRC) tasas.CRC = RESPALDO.CRC;

    res.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=86400");
    return res.status(200).json({
      base: "USD",
      tasas,
      fecha: d.date || null,
      fuente: "frankfurter.app (Banco Central Europeo)"
    });
  } catch (e) {
    // Nunca falla del todo: devuelve el respaldo para que la página siga funcionando
    res.setHeader("Cache-Control", "public, s-maxage=3600");
    return res.status(200).json({
      base: "USD",
      tasas: RESPALDO,
      fecha: null,
      fuente: "valores de respaldo",
      aviso: String(e)
    });
  }
}
