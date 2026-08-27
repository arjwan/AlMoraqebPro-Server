const { app, BrowserWindow, dialog, session, shell } = require('electron');
const path = require('node:path');

const appOrigin = new URL(
    process.env.ALMORAQEB_APP_URL ||
    'https://almoraqebpro-server-aymo.onrender.com/'
).origin;
const appUrl = `${appOrigin}/admin_login.html`;

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
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    window.setMenuBarVisibility(false);
    window.webContents.setWindowOpenHandler(({ url }) => {
        try {
            if (new URL(url).origin === appOrigin) return { action: 'allow' };
        } catch (_) {
            return { action: 'deny' };
        }
        shell.openExternal(url);
        return { action: 'deny' };
    });
    await window.loadURL(appUrl);
    window.once('ready-to-show', () => window.show());
}

app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        let trustedOrigin = false;
        try { trustedOrigin = new URL(webContents.getURL()).origin === appOrigin; }
        catch (_) { trustedOrigin = false; }
        callback(permission === 'geolocation' && trustedOrigin);
    });
    try {
        await createWindow();
    } catch (error) {
        dialog.showErrorBox(
            'AlMoraqeb Pro',
            'تعذر فتح التطبيق. شغّله مرة واحدة على الأقل أثناء توفر الإنترنت لتجهيز النسخة المحلية، ثم حاول مجددًا.\n\n' + error.message
        );
        app.quit();
    }
});

app.on('window-all-closed', () => app.quit());
