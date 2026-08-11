/**
 * مزامنة الموظفين من MongoDB إلى لوحة التحكم
 */

document.addEventListener('DOMContentLoaded', () => {
    fetchAndDisplayEmployees();
});

function getActiveCompanyId() {
    const params = new URLSearchParams(window.location.search);
    return (
        params.get('companyId') ||
        localStorage.getItem('activeCompanyId') ||
        localStorage.getItem('custom_company_id') ||
        ''
    ).trim();
}

async function fetchAndDisplayEmployees() {
    const companyId = getActiveCompanyId();
    if (!companyId) {
        console.warn('لم يتم تحديد رمز الشركة، لن يتم جلب الموظفين.');
        return;
    }

    try {
        const response = await fetch(`/api/employees/${encodeURIComponent(companyId)}?limit=200`, {
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('فشل في جلب الموظفين من MongoDB');

        const data = await response.json();
        const employees = Array.isArray(data.employees) ? data.employees : [];

        updateEmployeesTable(employees);
        updateSalariesTable(employees);

        const counter = document.getElementById('totalEmpCount');
        if (counter) counter.textContent = String(data.total ?? employees.length);
    } catch (error) {
        console.error('خطأ في مزامنة الموظفين:', error);
    }
}

function updateEmployeesTable(employees) {
    const tableBody = document.getElementById('employees-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    employees.forEach(emp => {
        const id = String(emp._id || '');
        const name = emp.name || '';
        const jobTitle = emp.specialty || emp.jobTitle || '';
        const phone = emp.phone || emp.email || '';
        const salary = Number(emp.salary || 0).toLocaleString('ar-IQ');

        tableBody.insertAdjacentHTML('beforeend', `
            <tr>
                <td>${escapeHtml(name)}</td>
                <td>${escapeHtml(jobTitle)}</td>
                <td>${escapeHtml(phone)}</td>
                <td>${salary} د.ع</td>
                <td>
                    <button class="btn-edit" data-id="${escapeHtml(id)}">تعديل</button>
                </td>
            </tr>
        `);
    });
}

function updateSalariesTable(employees) {
    const salaryTableBody = document.getElementById('salaries-table-body');
    if (!salaryTableBody) return;

    salaryTableBody.innerHTML = '';
    employees.forEach(emp => {
        const name = emp.name || '';
        const jobTitle = emp.specialty || emp.jobTitle || '';
        const salary = Number(emp.salary || 0);

        salaryTableBody.insertAdjacentHTML('beforeend', `
            <tr>
                <td>${escapeHtml(name)}</td>
                <td>${escapeHtml(jobTitle)}</td>
                <td>${salary.toLocaleString('ar-IQ')} د.ع</td>
                <td><input type="number" placeholder="الاستقطاعات" class="salary-deduction"></td>
                <td class="net-salary">${salary.toLocaleString('ar-IQ')} د.ع</td>
            </tr>
        `);
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}
