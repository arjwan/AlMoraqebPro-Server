/**
 * محرك مزامنة سجل الحركات والعمليات - نظام المراقب برو
 */
class ActivitySyncEngine {
    constructor() {
        this.dbName = 'AlMoraqebPro_LocalDB';
        this.storeName = 'activity_logs';
        this.db = null;
        this.initDB();
        this.setupNetworkListeners();
    }

    // تهيئة قاعدة البيانات المحلية IndexedDB لضمان أمان عالي وسعة تخزين كبيرة
    initDB() {
        const request = indexedDB.open(this.dbName, 1);
        request.onerror = (event) => console.error("خطأ في فتح قاعدة البيانات المحلية:", event.target.error);
        request.onsuccess = (event) => {
            this.db = event.target.result;
            this.checkAndSync(); // محاولة مزامنة أي بيانات قديمة عند الإقلاع
        };
        request.onupgradeneeded = (event) => {
            let db = event.target.result;
            if (!db.objectStoreNames.contains(this.storeName)) {
                db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
            }
        };
    }

    // تسجيل حركة جديدة (سواء كان الجهاز متصلاً أو غير متصل)
    async logActivity(actionType, details, employeeId) {
        const logData = {
            actionType,
            details,
            employeeId,
            timestamp: new Date().toISOString(),
            synced: false
        };

        if (navigator.onLine) {
            try {
                await this.sendToServer(logData);
                logData.synced = true;
            } catch (error) {
                console.warn("فشل الإرسال المباشر، جاري الحفظ محلياً...", error);
                await this.saveLocally(logData);
            }
        } else {
            await this.saveLocally(logData);
            this.showOfflineNotification();
        }
    }

    // حفظ الحركة محلياً في حالة أوفلاين
    saveLocally(data) {
        return new Promise((resolve, reject) => {
            if (!this.db) return reject("قاعدة البيانات المحلية غير جاهزة");
            const transaction = this.db.transaction([this.storeName], "readwrite");
            const store = transaction.objectStore(this.storeName);
            const request = store.add(data);
            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // إرسال البيانات إلى السيرفر
    async sendToServer(data) {
        const response = await fetch('/api/system/activity-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error('خطأ في استجابة السيرفر');
        return await response.json();
    }

    // الاستماع لعودة الإنترنت ومزامنة البيانات تلقائياً
    setupNetworkListeners() {
        window.addEventListener('online', () => {
            console.تم_الاتصال_بالإنترنت = "تم استعادة الاتصال، بدء المزامنة التلقائية...";
            this.checkAndSync();
        });
    }

    // عملية المزامنة التلقائية للسجلات المعلقة
    async checkAndSync() {
        if (!navigator.onLine || !this.db) return;

        const transaction = this.db.transaction([this.storeName], "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.getAll();

        request.onsuccess = async () => {
            const logs = request.result;
            for (let log of logs) {
                if (!log.synced) {
                    try {
                        await this.sendToServer(log);
                        // حذف الحركة من التخزين المحلي بعد نجاح رفعها للسيرفر
                        this.deleteLocalLog(log.id);
                    } catch (e) {
                        console.error("فشل مزامنة الحركة رقم:", log.id, e);
                        break; // إيقاف المؤقت مؤقتاً لحين استقرار الشبكة تماماً
                    }
                }
            }
        };
    }

    deleteLocalLog(id) {
        const transaction = this.db.transaction([this.storeName], "readwrite");
        const store = transaction.objectStore(this.storeName);
        store.delete(id);
    }

    showOfflineNotification() {
        // تنبيه خفيف للمستخدم بأن النظام يعمل بوضع الأوفلاين ويحفظ محلياً
        console.log("⚠️ الجهاز غير متصل بالإنترنت. يتم حفظ الحركات محلياً لحين الاتصال.");
    }
}

// تصدير كائن محرك المزامنة للاستخدام العام
const ActivityLogger = new ActivitySyncEngine();
