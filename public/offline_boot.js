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
        navigator.serviceWorker
            .register('/sw.js')
            .catch(err => {
                console.warn(
                    'Service Worker registration failed:',
                    err
                );
            });
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
