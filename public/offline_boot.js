(function () {
'use strict';

if (!document.querySelector('script[data-almoraqeb-i18n]')) {
    const script = document.createElement('script');
    script.src = '/i18n.js';
    script.dataset.almoraqebI18n = 'true';
    document.head.appendChild(script);
}

if (
    'serviceWorker' in navigator &&
    location.protocol !== 'file:'
) {
    window.addEventListener('load', () => {
        const hadController = Boolean(
            navigator.serviceWorker.controller
        );

        sessionStorage.removeItem(
            'almoraqeb_update_reloaded'
        );

        const showUpdateNotice = message => {
            let notice = document.getElementById(
                'almoraqebUpdateNotice'
            );

            if (!notice) {
                notice = document.createElement('div');
                notice.id = 'almoraqebUpdateNotice';
                Object.assign(notice.style, {
                    position: 'fixed',
                    left: '18px',
                    bottom: '18px',
                    zIndex: '99999',
                    background: '#075985',
                    color: '#fff',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    boxShadow: '0 8px 24px #0004',
                    fontWeight: '800'
                });
                document.body.appendChild(notice);
            }

            notice.textContent = message;
        };

        let applyingUpdate = false;

        const applyUpdate = async () => {
            if (
                applyingUpdate ||
                sessionStorage.getItem(
                    'almoraqeb_update_reloaded'
                ) === 'true'
            ) return;

            applyingUpdate = true;
            showUpdateNotice(
                '⬆ تم تنزيل تحديث جديد — جاري حفظ البيانات المحلية وتطبيقه'
            );

            try {
                if (
                    navigator.onLine &&
                    window.AlMoraqebOfflineSync
                ) {
                    await AlMoraqebOfflineSync.syncPending();

                    const pending =
                        await AlMoraqebOfflineSync.pendingCount();

                    if (pending > 0) {
                        showUpdateNotice(
                            '💾 التحديث جاهز وسيُطبق بعد مزامنة البيانات المحلية'
                        );
                        applyingUpdate = false;
                        return;
                    }
                }

                sessionStorage.setItem(
                    'almoraqeb_update_reloaded',
                    'true'
                );
                location.reload();
            } catch (_) {
                showUpdateNotice(
                    '💾 التحديث محفوظ وسيُطبق تلقائياً عند اكتمال المزامنة'
                );
                applyingUpdate = false;
            }
        };

        navigator.serviceWorker
            .register('/sw.js')
            .then(registration => {
                registration.update().catch(()=>{});

                setInterval(
                    () => registration.update().catch(()=>{}),
                    5 * 60 * 1000
                );

                registration.addEventListener(
                    'updatefound',
                    () => {
                        const worker = registration.installing;
                        if (!worker) return;

                        worker.addEventListener(
                            'statechange',
                            () => {
                                if (
                                    worker.state === 'installed' &&
                                    navigator.serviceWorker.controller
                                ) {
                                    showUpdateNotice(
                                        '⬆ تم تنزيل تحديث جديد للمراقب برو'
                                    );
                                }
                            }
                        );
                    }
                );
            })
            .catch(err => {
                console.warn(
                    'Service Worker registration failed:',
                    err
                );
            });

        navigator.serviceWorker.addEventListener(
            'controllerchange',
            () => {
                if (hadController) applyUpdate();
            }
        );
    });
}

window.addEventListener('online', () => {
    document.dispatchEvent(
        new CustomEvent('almoraqeb-online')
    );
});

window.addEventListener('offline', () => {
    document.dispatchEvent(
        new CustomEvent('almoraqeb-offline')
    );
});

})();
