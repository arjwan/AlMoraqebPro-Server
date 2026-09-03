const { app, BrowserWindow, dialog, session, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

app.disableHardwareAcceleration();

const configuredAppUrl = process.env.ALMORAQEB_APP_URL ||
    'https://almoraqebpro-server-aymo.onrender.com/admin_login.html';
const appUrlObject = new URL(configuredAppUrl);
const appOrigin = appUrlObject.origin;
const publicDir = path.resolve(__dirname, '..', 'public');
const appRoot = path.resolve(__dirname, '..');
const localServerPort = 47821;
let localServer;
let localOrigin;
let mainWindow;
const isDevelopment = !app.isPackaged;

const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

function forwardHeaders(request) {
    const headers = {};
    for (const name of ['accept', 'authorization', 'content-type', 'cookie', 'x-almoraqeb-sync']) {
        if (request.headers[name]) headers[name] = request.headers[name];
    }
    return headers;
}

async function proxyApi(request, response) {
    const body = [];
    for await (const chunk of request) body.push(chunk);

    try {
        const upstream = await fetch(appOrigin + request.url, {
            method: request.method,
            headers: forwardHeaders(request),
            body: body.length ? Buffer.concat(body) : undefined,
            redirect: 'follow',
            signal: AbortSignal.timeout(8000)
        });

        const responseHeaders = {};
        for (const [name, value] of upstream.headers) {
            if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(name)) {
                responseHeaders[name] = value;
            }
        }
        const cookies = typeof upstream.headers.getSetCookie === 'function'
            ? upstream.headers.getSetCookie()
            : [];
        if (cookies.length) responseHeaders['set-cookie'] = cookies;

        response.writeHead(upstream.status, responseHeaders);
        response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
        response.writeHead(503, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({
            success: false,
            offline: true,
            message: 'الخدمة غير متاحة حالياً بدون اتصال بالسيرفر'
        }));
        if (isDevelopment) console.warn('[desktop] API unavailable', request.url, error.message);
    }
}

function serveFile(request, response) {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    } catch (_) {
        response.writeHead(400);
        response.end();
        return;
    }

    const aliases = {
        '/developer/login': 'public/developer_login.html',
        '/developer/create-company': 'developer/create-company.html',
        '/developer/super-master-key': 'developer/super-master-key-v92.html'
    };
    const relativePath = aliases[pathname] || (pathname === '/' ? 'public/admin_login.html' : `public/${pathname.slice(1)}`);
    const filePath = path.resolve(appRoot, relativePath);
    if (!filePath.startsWith(appRoot + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        response.writeHead(404);
        response.end('Not found');
        return;
    }

    response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    });
    fs.createReadStream(filePath).pipe(response);
}

function startLocalServer() {
    if (!fs.existsSync(publicDir)) {
        throw new Error(`Bundled public directory is missing: ${publicDir}`);
    }

    return new Promise((resolve, reject) => {
        localServer = http.createServer((request, response) => {
            if (request.url.startsWith('/api/')) return proxyApi(request, response);
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                response.writeHead(405);
                response.end();
                return;
            }
            serveFile(request, response);
        });
        localServer.once('error', reject);
            localServer.listen(localServerPort, '127.0.0.1', () => {
            const address = localServer.address();
            localOrigin = `http://127.0.0.1:${address.port}`;
            resolve();
        });
    });
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 980,
        minHeight: 650,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#0f172a',
        title: 'AlMoraqebPro - المراقب برو',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    mainWindow.setMenuBarVisibility(false);
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const origin = new URL(url).origin;
            if (origin === appOrigin || origin === localOrigin) return { action: 'allow' };
        } catch (_) {
            return { action: 'deny' };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        try {
            const origin = new URL(url).origin;
            if (origin !== appOrigin && origin !== localOrigin) {
                event.preventDefault();
                shell.openExternal(url);
            }
        } catch (_) {
            event.preventDefault();
        }
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, _errorDescription, validatedURL) => {
        if (errorCode !== -3) {
            dialog.showErrorBox(
                'AlMoraqebPro',
                `تعذر تحميل واجهة المراقب برو.\n\n${validatedURL || localOrigin}`
            );
        }
    });
    if (isDevelopment) {
        mainWindow.webContents.on('render-process-gone', (_event, details) => console.error('[desktop] render-process-gone', details));
        mainWindow.webContents.on('console-message', (_event, details) => console.log('[desktop] web console', details));
        mainWindow.webContents.on('unresponsive', () => console.error('[desktop] renderer unresponsive'));
        mainWindow.webContents.on('child-process-gone', (_event, details) => console.error('[desktop] child-process-gone', details));
        mainWindow.webContents.on('certificate-error', (_event, _url, error, certificate) => console.error('[desktop] certificate-error', error, certificate));
    }
    mainWindow.once('ready-to-show', () => mainWindow.show());
    try {
        await mainWindow.loadURL(`${localOrigin}/admin_login.html`);
        if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
    } catch (error) {
        console.error('[desktop] loadURL failed', error);
        throw error;
    }
}

app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        let trustedOrigin = false;
        try { trustedOrigin = new URL(webContents.getURL()).origin === appOrigin; }
        catch (_) { trustedOrigin = false; }
        callback(permission === 'geolocation' && trustedOrigin);
    });
    try {
        await startLocalServer();
        await createWindow();
    } catch (error) {
        dialog.showErrorBox(
            'AlMoraqeb Pro',
            'تعذر فتح واجهة التطبيق المحلية المضمّنة.\n\n' + error.message
        );
        app.quit();
    }
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
    if (localServer) localServer.close();
});
