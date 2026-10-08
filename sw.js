const C = 'webide-v10';
const A = [
    './', 'index.html',
    'src/main.js', 'src/fs.js', 'src/editor.js', 'src/preview.js',
    'src/terminal.js', 'src/ui.js', 'src/keyboard.js', 'src/theme.css', 'src/format.js', 'src/zip.js',
    'src/vendor/codemirror.js'
];

/* ---------- install ---------- */
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(C).then(c => c.addAll(A)).catch(err => console.log('SW install:', err))
    );
    self.skipWaiting();
});

/* ---------- activate ---------- */
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(ks => Promise.all(
            ks.filter(k => k !== C).map(k => caches.delete(k))
        ))
    );
    self.clients.claim();
});

/* ---------- fetch ---------- */
self.addEventListener('fetch', e => {
    const r = e.request;

    /* Только GET */
    if (r.method !== 'GET') return;

    let url;
    try { url = new URL(r.url); } catch { return; }

    /* Только http(s) */
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

    /* Не перехватываем внешние CDN-ы — пусть идут напрямую */
    if (url.origin !== self.location.origin) return;

    /* Bypass JetBrains dev-server: _ijt, _ij_reload и прочие IDE-параметры */
    if (url.searchParams.has('_ijt') ||
        url.searchParams.has('_ij_reload') ||
        url.searchParams.has('_ij_reload_timeout')) return;

    e.respondWith(handle(r));
});

/* ---------- handler ---------- */
async function handle(r) {
    try {
        const cached = await caches.match(r);
        if (cached) {
            update(r);          // обновляем в фоне
            return cached;
        }

        const res = await fetch(r);
        if (res && res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(C).then(c => c.put(r, clone)).catch(() => {});
        }
        return res;
    } catch {
        /* fetch упал (offline) — пробуем кэш ещё раз */
        const fallback = await caches.match(r);
        if (fallback) return fallback;

        /* последний шанс — синтетический ответ, чтобы не отдавать undefined */
        return new Response('Offline', {
            status: 503,
            statusText: 'Offline',
            headers: { 'content-type': 'text/plain' }
        });
    }
}

function update(r) {
    fetch(r).then(res => {
        if (res && res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(C).then(c => c.put(r, clone)).catch(() => {});
        }
    }).catch(() => {});
}