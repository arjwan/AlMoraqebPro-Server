// محرك المزامنة وفحص الاتصال الفعلي بالسيرفر
class SyncEngine {
    constructor() {
        this.isConnected = false;
        this.initSyncListener();
    }

    initSyncListener() {
        // فحص الاتصال كل 5 ثوانٍ
        setInterval(() => {
            this.checkServerConnection();
        }, 5000);
        
        // الفحص فور تحميل الصفحة
        window.addEventListener('DOMContentLoaded', () => {
            this.checkServerConnection();
        });
    }

    checkServerConnection() {
        // استخدام مسار نسبى يعمل تلقائياً مع localhost أو Render
        fetch('/api/v1/employees', { method: 'GET' })
            .then(response => {
                if (response.ok) {
                    this.setConnectionStatus(true);
                } else {
                    this.setConnectionStatus(false);
                }
            })
            .catch(error => {
                this.setConnectionStatus(false);
            });
    }

    setConnectionStatus(status) {
        this.isConnected = status;
        // البحث عن شريط التنبيه في الصفحة وتغيير حالته
        const alertBox = document.getElementById('syncAlert') || document.querySelector('.sync-alert');
        
        if (alertBox) {
            if (status) {
                alertBox.style.background = '#16a34a'; // أخضر
                alertBox.style.color = '#ffffff';
                alertBox.textContent = '✅ متصل بالسيرفر والمزامنة تعمل بنجاح';
            } else {
                alertBox.style.background = '#dc2626'; // أحمر
                alertBox.style.color = '#ffffff';
                alertBox.textContent = '❌ تعذر الاتصال بالسيرفر للمزامنة.';
            }
        }
    }
}

// تشغيل المحرك تلقائياً
const syncEngine = new SyncEngine();
