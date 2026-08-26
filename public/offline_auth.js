(function () {
'use strict';

const ITERATIONS = 210000;

function bytesToBase64(bytes) {
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
}

function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function deriveVerifier(password, salt) {

    const material =
        await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );

    const bits =
        await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt,
                iterations: ITERATIONS,
                hash: 'SHA-256'
            },
            material,
            256
        );

    return new Uint8Array(bits);
}

async function saveCredential({
    companyId,
    username,
    password,
    role = 'admin'
}) {

    companyId = String(companyId || '').trim();
    username = String(username || '').trim();

    if (!companyId || !username || !password)
        throw new Error('بيانات الدخول المحلية ناقصة');

    if (!window.AlMoraqebOfflineDB)
        throw new Error('قاعدة Offline غير جاهزة');

    const salt =
        crypto.getRandomValues(
            new Uint8Array(16)
        );

    const verifier =
        await deriveVerifier(
            password,
            salt
        );

    const db =
        await AlMoraqebOfflineDB.openDB();

    return new Promise((resolve, reject) => {

        const tx =
            db.transaction(
                AlMoraqebOfflineDB.STORES.auth,
                'readwrite'
            );

        tx.objectStore(
            AlMoraqebOfflineDB.STORES.auth
        ).put({
            companyId,
            username,
            role,
            salt:
                bytesToBase64(salt),
            verifier:
                bytesToBase64(verifier),
            iterations:
                ITERATIONS,
            enabled:
                true,
            lastOnlineLoginAt:
                new Date().toISOString(),
            updatedAt:
                new Date().toISOString()
        });

        tx.oncomplete = () =>
            resolve(true);

        tx.onerror = () =>
            reject(tx.error);
    });
}

async function getCredential(companyId) {

    if (!window.AlMoraqebOfflineDB)
        return null;

    const db =
        await AlMoraqebOfflineDB.openDB();

    return new Promise((resolve, reject) => {

        const tx =
            db.transaction(
                AlMoraqebOfflineDB.STORES.auth,
                'readonly'
            );

        const req =
            tx.objectStore(
                AlMoraqebOfflineDB.STORES.auth
            ).get(String(companyId || '').trim());

        req.onsuccess = () =>
            resolve(req.result || null);

        req.onerror = () =>
            reject(req.error);
    });
}

async function verifyCredential(
    companyId,
    username,
    password
) {

    const record =
        await getCredential(companyId);

    if (
        !record ||
        record.enabled === false ||
        String(record.username) !==
            String(username || '').trim()
    ) {
        return false;
    }

    const salt =
        base64ToBytes(
            record.salt
        );

    const expected =
        base64ToBytes(
            record.verifier
        );

    const actual =
        await deriveVerifier(
            password,
            salt
        );

    if (
        actual.length !==
        expected.length
    ) return false;

    /*
     * مقارنة دون توقف مبكر.
     */
    let difference = 0;

    for (
        let i = 0;
        i < actual.length;
        i++
    ) {
        difference |=
            actual[i] ^
            expected[i];
    }

    return difference === 0;
}

function startOfflineSession(
    companyId,
    username,
    role = 'admin'
) {

    sessionStorage.setItem(
        'almoraqeb_admin_token',
        'offline-local-session'
    );

    sessionStorage.setItem(
        'almoraqeb_admin_offline',
        '1'
    );

    localStorage.setItem(
        'almoraqeb_admin_session',
        JSON.stringify({
            companyId:
                String(companyId),
            username:
                String(username),
            role,
            offlineMode:true
        })
    );

    localStorage.setItem(
        'companyId',
        String(companyId)
    );
}

function clearOfflineFlag() {

    sessionStorage.removeItem(
        'almoraqeb_admin_offline'
    );
}

function hasOfflineSession() {

    return (
        sessionStorage.getItem(
            'almoraqeb_admin_offline'
        ) === '1'
    );
}

function getSession() {

    try {
        return JSON.parse(
            localStorage.getItem(
                'almoraqeb_admin_session'
            ) || '{}'
        );
    } catch {
        return {};
    }
}

/*
 * تستخدمها صفحات المدير.
 *
 * ONLINE:
 * نتحقق من /api/admin/session.
 *
 * OFFLINE:
 * نسمح فقط إذا سبق للمدير أن دخل
 * من صفحة الدخول وتم إنشاء جلسة Offline.
 */
async function authorizePage(options = {}) {

    const session =
        getSession();

    const companyId =
        String(
            options.companyId ||
            session.companyId ||
            new URLSearchParams(
                location.search
            ).get('company') ||
            localStorage.getItem(
                'companyId'
            ) ||
            ''
        ).trim();

    if (!companyId)
        return {
            ok:false,
            offline:false,
            companyId:''
        };

    const token =
        sessionStorage.getItem(
            'almoraqeb_admin_token'
        ) || '';

    /*
     * إذا لا يوجد إنترنت نستخدم الجلسة
     * المحلية التي أنشئت بعد تحقق كلمة المرور.
     */
    if (!navigator.onLine) {

        const credential =
            await getCredential(
                companyId
            );

        if (
            credential &&
            credential.enabled !== false &&
            (
                hasOfflineSession() ||
                (
                    token &&
                    token !== 'offline-local-session'
                )
            )
        ) {
            return {
                ok:true,
                offline:true,
                companyId,
                username:
                    credential.username,
                role:
                    credential.role ||
                    'admin'
            };
        }

        return {
            ok:false,
            offline:true,
            companyId
        };
    }

    /*
     * إذا رجع الإنترنت وكان لدينا Token حقيقي،
     * نتحقق من السيرفر.
     */
    if (
        token &&
        token !==
            'offline-local-session'
    ) {

        try {

            const response =
                await fetch(
                    location.origin +
                    '/api/admin/session',
                    {
                        headers:{
                            Authorization:
                                'Bearer ' +
                                token
                        },
                        cache:'no-store'
                    }
                );

            const data =
                await response
                    .json()
                    .catch(()=>({}));

            if (
                response.ok &&
                data.success
            ) {

                clearOfflineFlag();

                return {
                    ok:true,
                    offline:false,
                    companyId
                };
            }

            /*
             * HTTP 401/403 يعني أن السيرفر
             * رفض الجلسة فعلياً.
             */
            return {
                ok:false,
                offline:false,
                companyId,
                serverRejected:true
            };

        } catch {

            /*
             * navigator.onLine قد يقول true
             * لكن Render غير قابل للوصول.
             */
            const credential =
                await getCredential(
                    companyId
                );

            if (
                credential &&
                (
                    hasOfflineSession() ||
                    (
                        token &&
                        token !== 'offline-local-session'
                    )
                )
            ) {
                return {
                    ok:true,
                    offline:true,
                    companyId
                };
            }

            return {
                ok:false,
                offline:true,
                companyId
            };
        }
    }

    /*
     * الجلسة الحالية Offline ولا يوجد
     * Token صالح للمزامنة مع السيرفر.
     */
    if (hasOfflineSession()) {

        const credential =
            await getCredential(
                companyId
            );

        if (credential) {
            return {
                ok:true,
                offline:true,
                companyId,
                needsOnlineLogin:true
            };
        }
    }

    return {
        ok:false,
        offline:false,
        companyId
    };
}

window.AlMoraqebOfflineAuth = {
    saveCredential,
    getCredential,
    verifyCredential,
    startOfflineSession,
    clearOfflineFlag,
    hasOfflineSession,
    authorizePage
};

})();
