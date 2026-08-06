// ==========================================
// ملف المزامنة والربط الشامل لنظام المراقب برو (Local & Sync Core)
// ==========================================

// 1. جلب جميع الموظفين المسجلين للشركة الحالية
function getAllEmployees() {
    const compId = localStorage.getItem('activeCompanyId') || 'default_company';
    return JSON.parse(localStorage.getItem(`employees_${compId}`)) || JSON.parse(localStorage.getItem('companyEmployees')) || [];
}

// 2. تسجيل موظف جديد وحفظه في التخزين المحلي فوراً لضمان ظهوره في الجداول
function registerNewEmployee(employeeData) {
    try {
        const compId = employeeData.companyId || localStorage.getItem('activeCompanyId') || 'default_company';
        localStorage.setItem('activeCompanyId', compId);

        // جلب القائمة الحالية
        let employees = JSON.parse(localStorage.getItem(`employees_${compId}`)) || [];
        
        // التحقق من عدم تكرار اسم المستخدم
        const exists = employees.find(emp => emp.username === employeeData.username || emp.phone === employeeData.phone);
        if (exists) {
            return { success: false, message: 'اسم المستخدم أو رقم الهاتف مستخدم مسبقاً!' };
        }

        employees.push(employeeData);
        
        // حفظ في المفتاح الخاص بالشركة والمفتاح العام
        localStorage.setItem(`employees_${compId}`, JSON.stringify(employees));
        localStorage.setItem('companyEmployees', JSON.stringify(employees));

        // إضافة إشعار لوحة تحكم المدير
        addCompanyNotification(`تم تسجيل موظف جديد: ${employeeData.name}`);

        return { success: true, message: 'تم التسجيل بنجاح' };
    } catch (error) {
        console.error("خطأ في التسجيل:", error);
        return { success: false, message: 'حدث خطأ أثناء حفظ البيانات محلياً.' };
    }
}

// 3. نظام الإشعارات والطلبات للمدير
function addCompanyNotification(text) {
    let notifications = JSON.parse(localStorage.getItem('companyNotifications')) || [];
    notifications.unshift({ text, time: new Date().toLocaleTimeString(), date: new Date().toLocaleDateString() });
    localStorage.setItem('companyNotifications', JSON.stringify(notifications));
}

// 4. محاكاة مزامنة محلية ناجحة بدون أخطاء سيرفر
function simulateLocalSync(companyId) {
    try {
        const compId = companyId || localStorage.getItem('activeCompanyId') || 'default_company';
        const syncData = {
            companyId: compId,
            employees: getAllEmployees(),
            timestamp: new Date().toISOString()
        };
        localStorage.setItem(`sync_backup_${compId}`, JSON.stringify(syncData));
        return { success: true };
    } catch (e) {
        return { success: false };
    }
}
