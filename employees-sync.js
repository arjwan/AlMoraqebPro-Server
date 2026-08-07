// employees-sync.js
function getCompanyKey() {
    const compId = localStorage.getItem('activeCompanyId') || 'default_company';
    return `company_employees_${compId}`;
}

function getAllEmployees() {
    return JSON.parse(localStorage.getItem(getCompanyKey())) || [];
}

function saveEmployee(employeeData) {
    let employees = getAllEmployees();
    // التحقق من التكرار
    if (employees.find(e => e.username === employeeData.username)) {
        return { success: false, message: 'اسم المستخدم مسجل مسبقاً!' };
    }
    employees.push(employeeData);
    localStorage.setItem(getCompanyKey(), JSON.stringify(employees));
    
    // إشعار المدير
    let notifications = JSON.parse(localStorage.getItem('companyNotifications') || '[]');
    notifications.unshift({ text: `موظف جديد: ${employeeData.name}`, time: new Date().toLocaleString() });
    localStorage.setItem('companyNotifications', JSON.stringify(notifications));
    return { success: true };
}
