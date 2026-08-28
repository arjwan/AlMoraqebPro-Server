'use strict';

const CACHE_NAME = 'almoraqebpro-v9';

const CORE_FILES = [
    '/',
    '/index.html',
    '/admin_login.html',
    '/admin.html',
    '/admin_employees.html',
    '/admin_locations.html',
    '/admin_shifts.html',
    '/admin_attendance.html',
    '/admin_operations.html',
    '/admin_reports.html',
    '/admin_settings.html',
    '/admin_map.html',
    '/admin_archive.html',
    '/admin_notifications.html',
    '/backup_system.html',
    '/offline_db.js',
    '/offline_sync.js',
    '/offline_auth.js',
    '/offline_boot.js',
    '/i18n.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CORE_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key =>
                        key.startsWith('almoraqebpro-') &&
                        key !== CACHE_NAME
                    )
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {

    const request = event.request;

    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);

    /*
     * طلبات API لا نخزنها في Cache Storage.
     * ستدار لاحقاً عبر IndexedDB والمزامنة.
     */
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    event.respondWith(
        fetch(request)
            .then(response => {

                const copy =
                    response.clone();

                caches.open(CACHE_NAME)
                    .then(cache =>
                        cache.put(
                            request,
                            copy
                        )
                    );

                return response;
            })
            .catch(async () => {

                const cached =
                    await caches.match(request);

                if (cached) {
                    return cached;
                }

                /*
                 * إذا حاول المستخدم فتح صفحة مدير
                 * غير موجودة في الكاش، نعيد لوحة الدخول.
                 */
                if (
                    request.mode === 'navigate'
                ) {
                    return caches.match(
                        '/admin_login.html'
                    );
                }

                throw new Error(
                    'Offline resource unavailable'
                );
            })
    );
});
