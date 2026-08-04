/**
 * ملف إدارة وعرض الموظفين الموحد لنظام المراقب برو
 */

document.addEventListener("DOMContentLoaded", () => {
    fetchAndDisplayEmployees();
});

async function fetchAndDisplayEmployees() {
    try {
        const response = await fetch('/api/employees');
        if (!response.ok) {
            throw new Error("فشل في جلب البيانات من الخادم");
        }

        const employees = await response.json();
        
        updateEmployeesTable(employees);
        updateSalariesTable(employees);

    } catch (error) {
        console.error("خطأ في المزامنة:", error);
    }
}

// تحديث جدول إدارة الموظفين
function updateEmployeesTable(employees) {
    const tableBody = document.getElementById('employees-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    employees.forEach(emp => {
        tableBody.innerHTML += `
            <tr>
                <td>${emp.full_name}</td>
                <td>${emp.job_title}</td>
                <td>${emp.phone}</td>
                <td>${emp.base_salary} د.ع</td>
                <td>
                    <button class="btn-edit" onclick="editEmployee(${emp.id})">تعديل</button>
                    <button class="btn-delete" onclick="deleteEmployee(${emp.id})">حذف</button>
                </td>
            </tr>
        `;
    });
}

// تحديث جدول الرواتب تلقائياً
function updateSalariesTable(employees) {
    const salaryTableBody = document.getElementById('salaries-table-body');
    if (!salaryTableBody) return;

    salaryTableBody.innerHTML = '';
    employees.forEach(emp => {
        salaryTableBody.innerHTML += `
            <tr>
                <td>${emp.full_name}</td>
                <td>${emp.job_title}</td>
                <td>${emp.base_salary} د.ع</td>
                <td><input type="number" placeholder="الاستقطاعات" class="salary-deduction" data-id="${emp.id}"></td>
                <td class="net-salary">${emp.base_salary} د.ع</td>
            </tr>
        `;
    });
}
