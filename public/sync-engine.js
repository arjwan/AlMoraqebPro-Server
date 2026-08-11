// محرك المزامنة وفحص الاتصال الفعلي بالسيرفر
class SyncEngine {
    constructor() {
        this.isConnected = false;
        this.initSyncListener();
    }

    initSyncListener() {
        setInterval(() => this.checkServerConnection(), 5000);
        window.addEventListener('DOMContentLoaded', () => this.checkServerConnection());
    }

    async checkServerConnection() {
        try {
            const response = await fetch('/api/ping', { method: 'GET', cache: 'no-store' });
            this.setConnectionStatus(response.ok);
        } catch (error) {
            this.setConnectionStatus(false);
        }
    }

    setConnectionStatus(status) {
        this.isConnected = status;
        const alertBox = document.getElementById('syncAlert') || document.querySelector('.sync-alert');
        if (!alertBox) return;

        if (status) {
            alertBox.style.background = '#16a34a';
            alertBox.style.color = '#ffffff';
            alertBox.textContent = '✅ متصل بالسيرفر وMongoDB';
        } else {
            alertBox.style.background = '#dc2626';
            alertBox.style.color = '#ffffff';
            alertBox.textContent = '❌ تعذر الاتصال بالسيرفر';
        }
    }
}

const syncEngine = new SyncEngine();
