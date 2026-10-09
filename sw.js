/* Версия кэша. Изменил любой файл из PRECACHE — подними номер, иначе установленное
   приложение продолжит отдавать старую версию. */
const V = 'webide-v11';

const PRECACHE = [
    './', 'index.html', 'manifest.json',
    'src/main.js', 'src/fs.js', 'src/editor.js', 'src/preview.js',
    'src/terminal.js', 'src/ui.js', 'src/keyboard.js', 'src/theme.css',
    'src/format.js', 'src/zip.js',
    'src/vendor/codemirror.js',
    'icons/icon-192.png', 'icons/icon-512.png'
];

/* На локальном dev-сервере SW ничего не перехватывает — всегда свежие файлы.
   Если хочешь тестировать офлайн на localhost, поставь false. */
const BYPASS_LOCAL = true;
const IS_LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

/* ---------- install ---------- */
self.addEventListener('install', e => {
    e.waitUntil((async () => {
        const c = await caches.open(V);
        /* По одному: отсутствующий файл (например, иконка) не ломает всю установку.
           cache:'reload' — берём файлы с сервера, а не из HTTP-кэша браузера. */
        await Promise.allSettled(PRECACHE.map(u => c.add(new Request(u, { cache: 'reload' }))));
    })());
    self.skipWaiting();
});

/* ---------- activate ---------- */
self.addEventListener('activate', e => {
    e.waitUntil((async () => {
        const ks = await caches.keys();
        await Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

/* ---------- fetch ---------- */
self.addEventListener('fetch', e => {
    const r = e.request;

    if (r.method !== 'GET') return;
    if (BYPASS_LOCAL && IS_LOCAL) return;

    let url;
    try { url = new URL(r.url); } catch { return; }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (url.origin !== self.location.origin) return;          /* CDN идут напрямую */

    /* JetBrains dev-server */
    if (url.searchParams.has('_ijt') ||
        url.searchParams.has('_ij_reload') ||
        url.searchParams.has('_ij_reload_timeout')) return;

    e.respondWith(handle(e));
});

/* Cache-first БЕЗ фонового перекачивания: на старте нет лишних запросов и записей на диск.
   Обновления приходят со сменой версии V (новый SW заново качает PRECACHE). */
async function handle(e) {
    const r = e.request;
    const cache = await caches.open(V);                       /* только свой кэш, не все подряд */

    const hit = await cache.match(r, { ignoreSearch: true });
    if (hit) return hit;

    try {
        const res = await fetch(r);
        if (res && res.ok && res.type === 'basic') {
            e.waitUntil(cache.put(r, res.clone()).catch(() => {}));
        }
        return res;
    } catch {
        /* офлайн: для переходов отдаём оболочку приложения */
        if (r.mode === 'navigate') {
            const shell = (await cache.match('index.html')) || (await cache.match('./'));
            if (shell) return shell;
        }
        return new Response('Offline', {
            status: 503,
            statusText: 'Offline',
            headers: { 'content-type': 'text/plain' }
        });
    }
}