/* Tropical Experts — limpieza del sitio viejo (WordPress hackeado).
   Responde 410 "Ya no existe" a las direcciones basura para que Google y Bing las borren:
   - spam japonés en la portada con ?v=...           (ej. /?v=076436835oo9455)
   - /detail/... , páginas y archivos de WordPress (.php, /wp-..., /producto/, /shop, /category/...)
   - artículos de casino que inyectaron los hackers.
   Todo lo demás pasa normal (no se devuelve nada = la petición sigue su camino). */
// Primer tramo de la ruta (segmento completo, no prefijo: así /cartago, /feedback o /shopping NO caen).
const GONE_SEG = ["detail", "producto", "product", "shop", "checkout", "cart", "my-account", "category", "tag",
  "author", "feed", "comments", "xmlrpc", "our-house", "about-us-2", "tours-adventures"];
const SPAM = /(casino|kazino|kasina|kockanja|slot-machine|bonos-de|qazanc|winning-big|medbonus|regulasyon)/;
const BODY = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>410 Gone</title></head>' +
  '<body style="font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 16px"><h1>This page no longer exists</h1>' +
  '<p>It belonged to an old version of this domain and was removed permanently.</p>' +
  '<p><a href="https://www.tropicalexpertscostarica.com/">Tropical Experts Costa Rica — private shuttles and airport transfers</a></p></body></html>';

export function isGone(url) {
  const u = new URL(url);
  const p = u.pathname.toLowerCase();
  if (u.searchParams.has("v")) return true;
  if (p.endsWith(".php")) return true;
  if (p.startsWith("/wp-")) return true;
  if (GONE_SEG.includes(p.split("/")[1] || "")) return true;
  // casino: solo slugs sueltos en la raíz (nunca /hotel/..., /shuttle/..., /es/...)
  if (/^\/[^/]+\/?$/.test(p) && SPAM.test(p)) return true;
  return false;
}

export default function middleware(request) {
  try {
    if (isGone(request.url)) {
      return new Response(BODY, { status: 410, headers: {
        "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "public, max-age=3600" } });
    }
  } catch (e) { /* ante cualquier error, la página sigue normal */ }
}

export const config = {
  // no se ejecuta para fotos ni archivos estáticos
  matcher: ["/((?!fotos/|.*\\.(?:webp|png|jpg|jpeg|gif|svg|ico|css|js|xml|txt|json|pdf|woff2?)$).*)"],
};
