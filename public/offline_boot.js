(function () {
'use strict';

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
