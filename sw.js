/* Tropical Experts Costa Rica — trabajador de servicio (service worker).
 *
 * Qué hace: permite que la página se instale como aplicación y que siga
 * abriendo aunque el cliente se quede sin señal en carretera.
 *
 * Regla principal: PRIMERO LA RED. Siempre se pide la versión fresca al
 * servidor; la copia guardada solo se usa si no hay internet. Así, cuando usted
 * actualice el sitio, nadie se queda viendo una versión vieja.
 *
 * Si algún día cambia algo importante, suba el número de VERSION: eso borra
 * las copias viejas de todos los teléfonos.
 */
const VERSION = 'te-v1';
const CACHE = 'tropical-experts-' + VERSION;

// Lo mínimo para que la app abra sin señal la primera vez.
const BASICOS = ['/', '/index.html', '/img/app-192.png', '/img/logo-te.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(BASICOS).catch(() => {}))   // si algo falla, no se cae la instalación
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // Solo lecturas del propio sitio. Nada de pagos, órdenes ni otros dominios.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        // Se guarda una copia buena para cuando no haya señal.
        if (res && res.status === 200 && res.type === 'basic') {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit =>
          hit || (req.mode === 'navigate' ? caches.match('/index.html') : undefined)
        )
      )
  );
});
