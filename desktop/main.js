const { app, BrowserWindow, dialog, session, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const desktopPort = Number(process.env.ALMORAQEB_DESKTOP_PORT || 8433);
let serverProcess = null;

function projectRoot() {
    return app.getAppPath();
}

function waitForServer(timeoutMs = 30000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
        const check = () => {
            const request = http.get(`http://127.0.0.1:${desktopPort}/api/ping`, response => {
                response.resume();
                resolve();
            });
            request.on('error', () => {
                if (Date.now() - started >= timeoutMs) reject(new Error('تعذر تشغيل خادم المراقب برو'));
                else setTimeout(check, 350);
            });
            request.setTimeout(1500, () => request.destroy());
        };
        check();
    });
}

function startServer() {
    const root = projectRoot();
    serverProcess = spawn(process.execPath, ['-r', path.join(root, 'server-preload.js'), '-r', path.join(root, 'admin-pages-preload.js'), path.join(root, 'server.js')], {
        cwd: root,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: String(desktopPort) },
        stdio: 'ignore',
        windowsHide: true
    });
}

async function createWindow() {
    const window = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 980,
        minHeight: 650,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#0f172a',
        title: 'AlMoraqeb Pro',
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    window.setMenuBarVisibility(false);
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith(`http://127.0.0.1:${desktopPort}`)) return { action: 'allow' };
        shell.openExternal(url);
        return { action: 'deny' };
    });
    await window.loadURL(`http://127.0.0.1:${desktopPort}/admin_login.html`);
    window.once('ready-to-show', () => window.show());
}

app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(permission === 'geolocation' && webContents.getURL().startsWith(`http://127.0.0.1:${desktopPort}`));
    });
    startServer();
    try {
        await waitForServer();
        await createWindow();
    } catch (error) {
        dialog.showErrorBox('AlMoraqeb Pro', error.message);
        app.quit();
    }
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
    if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGTERM');
});
