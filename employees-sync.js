// نظام المزامنة والربط الآلي الشامل - المراقب برو
const STORAGE_KEYS = {
    EMPLOYEES: 'companyEmployees',
    ATTENDANCE: 'companyAttendanceLogs',
    NOTIFICATIONS: 'companyNotifications',
    REQUESTS: 'companyRequests'
};

// جلب جميع الموظفين المسجلين
function getAllEmployees() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.EMPLOYEES)) || [];
}

// حفظ أو إضافة موظف جديد وتوليد إشعار وطلب آلي للمدير
function registerNewEmployee(employeeData) {
    let employees = getAllEmployees();
    
    // التحقق من عدم تكرار اسم المستخدم أو الهاتف
    const exists = employees.find(emp => emp.username === employeeData.username || emp.phone === employeeData.phone);
    if (exists) {
        return { success: false, message: 'اسم المستخدم أو رقم الهاتف مسجل مسبقاً!' };
    }

    employees.push(employeeData);
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));

    // توليد إشعار تلقائي للمدير بوجود تسجيل جديد
    addNotification({
        id: 'notif_' + Date.now(),
        title: 'تسجيل موظف جديد 📱',
        message: `قام الموظف (${employeeData.name}) بالتسجيل والانضمام للشركة (${employeeData.companyName || 'بدون اسم'})`,
        date: new Date().toLocaleString(),
        read: false
    });

    // توليد طلب تفعيل حساب آلي للمدير
    addRequest({
        id: 'req_' + Date.now(),
        employeeId: employeeData.id,
        name: employeeData.name,
        phone: employeeData.phone,
        companyId: employeeData.companyId,
        status: 'قيد الانتظار',
        date: new Date().toLocaleDateString()
    });

    return { success: true, message: 'تم التسجيل والربط بنجاح!' };
}

// إضافة إشعار جديد
function addNotification(notif) {
    let notifs = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) || [];
    notifs.unshift(notif);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
}

// إضافة طلب جديد
function addRequest(req) {
    let reqs = JSON.parse(localStorage.getItem(STORAGE_KEYS.REQUESTS)) || [];
    reqs.unshift(req);
    localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(reqs));
}
