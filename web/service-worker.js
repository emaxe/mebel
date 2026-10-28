// Cache-first для статики. При изменении файлов увеличьте VERSION.
const VERSION = 'mebel-v62';
const ASSETS = [
  './', 'index.html', 'production.html', 'view.html', 'view.js', 'pwa.js', 'manifest.webmanifest',
  'app.js', 'model.js', 'model-fronts.js', 'build3d.js', 'export.js', 'nest.js', 'model-corner.js', 'cells.js', 'room.js', 'library.js', 'verify.js', 'norms.js', 'project.js', 'worktop.js', 'plan.js', 'kinematics.js', 'rules.js', 'autofix.js', 'three-d-stage.js',
  'catalog.js', 'fittings.js', 'hwparams.js', 'partinfo.js', 'production-view.js', 'check.js', 'assembly.js', 'axo.js', 'projects.js', 'thumbs.js', 'api.js', 'sync.js', 'account.js', 'estimate.js', 'drawings.js', 'dims.js', 'dxf.js', 'export-cut.js', 'partdraw.js', 'history.js', 'ui-util.js', 'exports.js', 'version.js', 'vendor/qrcode/qrcode.js', 'vendor/qrcode/qrcode_UTF8.js',
  'vendor/three/build/three.module.js', 'vendor/three/build/three.core.js',
  'vendor/three/examples/jsm/controls/OrbitControls.js',
  'vendor/three/examples/jsm/exporters/OBJExporter.js',
  'vendor/three/examples/jsm/exporters/GLTFExporter.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // API — только сеть: ответы сервера зависят от входа и не должны оседать в кэше
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
