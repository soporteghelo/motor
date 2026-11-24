/**
 * Service worker de MOTOR PWA (versión web / Vercel)
 * -------------------------------------------------------------------------
 * Solo cachea el "cascarón" de la app (HTML, iconos, librerías de CDN) para
 * que abra sin conexión en campo. Los DATOS no pasan por aquí:
 *   - Supabase (REST, Auth, Storage) y /api/*  → siempre red, nunca caché
 *   - registros offline                        → IndexedDB (Offline_Engine)
 * Cachear respuestas de Supabase mezclaría datos entre usuarios del mismo
 * dispositivo y serviría registros vencidos.
 */
const VERSION = '__BUILD_ID__';
const SHELL   = 'motor-shell-' + VERSION;
// v2: las librerías con SRI (crossorigin) no pueden servirse desde una copia
// "opaca" guardada antes; se descarta la caché vieja.
const CDN     = 'motor-cdn-v2';

const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg',
                  '/icons/icon-192.png', '/icons/icon-512.png']
                 // Tailwind, fuentes, iconos y SheetJS ya no vienen de un CDN:
                 // viven en /vendor. La lista la escribe build_web.js leyendo
                 // web/vendor/, para que no se quede vieja al cambiar una
                 // fuente (sus nombres llevan un hash del contenido).
                 .concat(__VENDOR__);

// El único tercero que queda: el modelo de detección facial de MediaPipe. Son
// varios MB, no se empaqueta, y Face_Capture degrada solo a "Usa la cámara del
// teléfono" si no está. Se cachea tras el primer uso, así la captura
// automática también funciona sin red después.
const CDN_HOSTS = ['cdn.jsdelivr.net'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => (k.startsWith('motor-shell-') && k !== SHELL) || (k.startsWith('motor-cdn-') && k !== CDN))
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Datos y autenticación: siempre red
  if (url.pathname.startsWith('/api/') || url.hostname.endsWith('.supabase.co') ||
      url.hostname.endsWith('.supabase.in')) return;

  // Navegación: red primero (para recibir versiones nuevas), caché sin red.
  // Solo se guarda una respuesta correcta: un 404/500 puntual no debe
  // sustituir al cascarón offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok && res.type === 'basic') {
            const copia = res.clone();
            caches.open(SHELL).then(c => c.put('/index.html', copia));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // CDN: caché primero y se refresca en segundo plano. Una respuesta opaca
  // solo sirve para una petición no-cors (las de SRI/crossorigin la rechazan).
  if (CDN_HOSTS.indexOf(url.hostname) !== -1) {
    event.respondWith(
      caches.open(CDN).then(async (cache) => {
        const enCache = await cache.match(req);
        const usable = enCache && !(enCache.type === 'opaque' && req.mode === 'cors') ? enCache : null;
        const red = fetch(req).then(res => {
          if (res && (res.ok || (res.type === 'opaque' && req.mode === 'no-cors'))) cache.put(req, res.clone());
          return res;
        }).catch(() => usable || Response.error());
        return usable || red;
      })
    );
    return;
  }

  // Estáticos propios (iconos, manifest)
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
  }
});
