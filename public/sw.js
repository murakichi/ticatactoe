/* オフライン対応用の Service Worker。
 * - ナビゲーション: ネットワーク優先、失敗したらキャッシュした index.html
 * - 同一オリジンの静的ファイル(ハッシュ付き): キャッシュ優先
 * - Google Fonts: stale-while-revalidate
 */
const VERSION = 'v1';
const CACHE = `ticatactoe-${VERSION}`;
const SHELL = ['./', 'index.html', 'manifest.json', 'favicon.ico', 'logo192.png', 'logo512.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

const put = (req, res) => {
    if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
};

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then((res) => put("index.html", res))
                .catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
        );
        return;
    }

    // シミュレーション用(ハッシュ無し)は古いコードが残らないようネットワーク優先
    if (url.origin === self.location.origin && /\/(sim\/|simWorker\.js)/.test(url.pathname)) {
        event.respondWith(fetch(req).then((res) => put(req, res)).catch(() => caches.match(req)));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res)))
        );
        return;
    }

    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(
            caches.match(req).then((hit) => {
                const net = fetch(req).then((res) => put(req, res)).catch(() => hit);
                return hit || net;
            })
        );
    }
});
