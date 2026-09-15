// api/reviews.js — Tropical Experts Costa Rica
// Devuelve la calificación y el número de reseñas de Google, actualizados solos.
//
// Cómo funciona: la red de Vercel guarda la respuesta 24 horas (s-maxage), así que
// aunque entren 10 000 visitantes en un día, a Google se le hace UNA sola llamada.
// Eso mantiene el consumo dentro del crédito gratuito mensual sin esfuerzo.

const PLACE_ID = "ChIJd3TbHx91hYARd5tTauz_1o4";   // ficha de Tropical Experts Costa Rica

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Falta la variable GOOGLE_MAPS_API_KEY" });
  }

  try {
    const r = await fetch(
      `https://places.googleapis.com/v1/places/${PLACE_ID}` +
      `?fields=rating,userRatingCount,displayName&languageCode=es`,
      { headers: { "X-Goog-Api-Key": key } }
    );

    if (!r.ok) {
      const detalle = await r.text();
      return res.status(502).json({ error: "Google respondió " + r.status, detalle });
    }

    const d = await r.json();

    // 24 h en la caché de Vercel; si vence, sirve la vieja mientras refresca
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=172800");

    return res.status(200).json({
      rating: d.rating ?? null,
      total:  d.userRatingCount ?? null,
      nombre: d.displayName?.text ?? null,
      actualizado: new Date().toISOString()
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
