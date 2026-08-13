/**
 * مزامنة الموظفين من MongoDB إلى لوحة التحكم
 * متوافق مع نظام المصادقة عبر التوكن
 */

document.addEventListener('DOMContentLoaded', () => {
    // التحقق من المصادقة أولاً
    if (typeof auth === 'function') {
        auth().then(() => {
            fetchAndDisplayEmployees();
        });
    } else {
        fetchAndDisplayEmployees();
    }
});

// ============================================================
// الحصول على معرف الشركة من الجلسة (وليس localStorage فقط)
// ============================================================
function getActiveCompanyId() {
    // 1. من رابط الصفحة (الأولوية القصوى)
    const params = new URLSearchParams(window.location.search);
    const companyFromUrl = params.get('company') || params.get('companyId');
    if (companyFromUrl) return companyFromUrl.trim();

    // 2. من جلسة المستخدم المخزنة في localStorage (مؤقت)
    try {
        const session = JSON.parse(localStorage.getItem('almoraqeb_admin_session') || '{}');
        if (session.companyId) return String(session.companyId).trim();
    } catch {}

    // 3. من localStorage القديم (للتوافق)
    return (localStorage.getItem('activeCompanyId') || 
            localStorage.getItem('custom_company_id') || 
            '').trim();
}

// ============================================================
// الحصول على التوكن من Session Storage
// ============================================================
function getAuthToken() {
    return sessionStorage.getItem('almoraqeb_admin_token') || '';
}

// ============================================================
// جلب الموظفين من MongoDB مع المصادقة
// ============================================================
async function fetchAndDisplayEmployees() {
    const companyId = getActiveCompanyId();
    const token = getAuthToken();

    if (!companyId) {
        console.warn('⚠️ لم يتم تحديد رمز الشركة');
        showStatus('⚠️ يرجى تسجيل الدخول مرة أخرى', 'warning');
        return;
    }

    if (!token) {
        console.warn('⚠️ لا يوجد توكن مصادقة');
        showStatus('⚠️ جلسة غير صالحة، يرجى تسجيل الدخول', 'error');
        return;
    }

    try {
        const response = await fetch(`/api/employees?companyId=${encodeURIComponent(companyId)}&limit=200`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        });

        if (response.status === 401) {
            showStatus('⛔ انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى', 'error');
            setTimeout(() => { location.href = 'admin_login.html'; }, 2000);
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // التأكد من هيكل البيانات
        const employees = Array.isArray(data.employees) ? data.employees : 
                         Array.isArray(data.data) ? data.data : [];

        // تحديث الجداول
        updateEmployeesTable(employees);
        updateSalariesTable(employees);

        // تحديث العداد
        const counter = document.getElementById('totalEmpCount');
        if (counter) {
            counter.textContent = data.total !== undefined ? data.total : employees.length;
        }

        showStatus(`✅ تم تحميل ${employees.length} موظف`, 'success');

    } catch (error) {
        console.error('❌ خطأ في مزامنة الموظفين:', error);
        showStatus('❌ فشل تحميل البيانات: ' + error.message, 'error');
    }
}

// ============================================================
// تحديث جدول الموظفين
// ============================================================
function updateEmployeesTable(employees) {
    const tableBody = document.getElementById('employees-table-body') || 
                      document.getElementById('empTableBody');
    if (!tableBody) {
        console.warn('⚠️ لم يتم العثور على جدول الموظفين');
        return;
    }

    if (!employees || employees.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:#64748b;padding:20px;">📭 لا يوجد موظفون مسجلون</td></tr>`;
        return;
    }

    tableBody.innerHTML = employees.map((emp, index) => {
        const id = String(emp._id || emp.id || '');
        const name = emp.name || 'غير معروف';
        const companyId = emp.companyId || emp.company_id || '—';
        const email = emp.email || '—';
        const salary = Number(emp.salary || 0);
        const specialty = emp.specialty || emp.jobTitle || '—';
        const status = emp.status || 'active';
        const statusText = status === 'active' ? '✅ نشط' : '⛔ غير نشط';
        const statusClass = status === 'active' ? 'status-active' : 'status-inactive';

        return `
            <tr data-id="${escapeHtml(id)}">
                <td>${index + 1}</td>
                <td>${escapeHtml(companyId)}</td>
                <td><b>${escapeHtml(name)}</b></td>
                <td>${escapeHtml(email)}</td>
                <td>${salary.toLocaleString('ar-IQ')} د.ع</td>
                <td>${escapeHtml(specialty)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="btn btn-blue" style="padding:4px 10px;font-size:11px;" onclick="editEmployee('${escapeHtml(id)}')">✏️</button>
                    <button class="btn btn-red" style="padding:4px 10px;font-size:11px;" onclick="deleteEmployee('${escapeHtml(id)}')">🗑️</button>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================================
// تحديث جدول الرواتب
// ============================================================
function updateSalariesTable(employees) {
    const tableBody = document.getElementById('salaries-table-body') || 
                      document.getElementById('salaryTableBody');
    if (!tableBody) {
        console.warn('⚠️ لم يتم العثور على جدول الرواتب');
        return;
    }

    if (!employees || employees.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:20px;">📭 لا توجد بيانات رواتب</td></tr>`;
        return;
    }

    tableBody.innerHTML = employees.map((emp) => {
        const name = emp.name || 'غير معروف';
        const specialty = emp.specialty || emp.jobTitle || '—';
        const salary = Number(emp.salary || 0);
        const deduction = Number(emp.deduction || 0);
        const netSalary = salary - deduction;

        return `
            <tr>
                <td><b>${escapeHtml(name)}</b></td>
                <td>${escapeHtml(specialty)}</td>
                <td>${salary.toLocaleString('ar-IQ')} د.ع</td>
                <td><input type="number" class="salary-deduction" data-id="${escapeHtml(emp._id || emp.id || '')}" value="${deduction}" placeholder="الاستقطاعات" style="width:100px;padding:6px;border:2px solid #94a3b8;border-radius:8px;"></td>
                <td class="net-salary" style="font-weight:900;color:#10b981;">${netSalary.toLocaleString('ar-IQ')} د.ع</td>
            </tr>
        `;
    }).join('');

    // إضافة مستمعي الأحداث لتحديث الصافي عند تغيير الاستقطاعات
    document.querySelectorAll('.salary-deduction').forEach(input => {
        input.addEventListener('input', function() {
            const row = this.closest('tr');
            const salaryText = row.querySelector('td:nth-child(3)').textContent.replace(/[^\d]/g, '');
            const salary = parseInt(salaryText) || 0;
            const deduction = parseInt(this.value) || 0;
            const net = salary - deduction;
            const netCell = row.querySelector('.net-salary');
            if (netCell) {
                netCell.textContent = net.toLocaleString('ar-IQ') + ' د.ع';
                netCell.style.color = net < 0 ? '#ef4444' : '#10b981';
            }
        });
    });
}

// ============================================================
// دالة تعديل موظف
// ============================================================
async function editEmployee(id) {
    if (!id) {
        alert('⚠️ معرف الموظف غير صالح');
        return;
    }

    const token = getAuthToken();
    if (!token) {
        alert('⛔ جلسة غير صالحة، يرجى تسجيل الدخول');
        location.href = 'admin_login.html';
        return;
    }

    try {
        const response = await fetch(`/api/employees/${encodeURIComponent(id)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('فشل جلب بيانات الموظف');

        const data = await response.json();
        const emp = data.employee || data.data || data;

        // عرض بيانات الموظف في مودال التعديل
        alert(`✏️ تعديل بيانات الموظف:\n\nالاسم: ${emp.name || ''}\nالبريد: ${emp.email || ''}\nالراتب: ${emp.salary || 0}`);
        
        // إذا كان هناك مودال مخصص، يمكن ملؤه هنا
        // document.getElementById('editId').value = id;
        // document.getElementById('editName').value = emp.name || '';
        // ...

    } catch (error) {
        console.error('❌ خطأ في جلب بيانات الموظف:', error);
        alert('❌ فشل تحميل بيانات الموظف');
    }
}

// ============================================================
// دالة حذف موظف
// ============================================================
async function deleteEmployee(id) {
    if (!id) {
        alert('⚠️ معرف الموظف غير صالح');
        return;
    }

    if (!confirm('⚠️ هل أنت متأكد من حذف هذا الموظف؟')) return;

    const token = getAuthToken();
    if (!token) {
        alert('⛔ جلسة غير صالحة، يرجى تسجيل الدخول');
        location.href = 'admin_login.html';
        return;
    }

    try {
        const response = await fetch(`/api/employees/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) {
            alert('⛔ انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى');
            location.href = 'admin_login.html';
            return;
        }

        if (!response.ok) throw new Error('فشل حذف الموظف');

        const result = await response.json();
        if (result.success !== false) {
            alert('✅ تم حذف الموظف بنجاح');
            fetchAndDisplayEmployees(); // تحديث الجداول
        } else {
            alert('❌ ' + (result.message || 'فشل الحذف'));
        }

    } catch (error) {
        console.error('❌ خطأ في حذف الموظف:', error);
        alert('❌ فشل حذف الموظف: ' + error.message);
    }
}

// ============================================================
// دالة عرض الحالة
// ============================================================
function showStatus(message, type = '') {
    const statusEl = document.getElementById('status') || document.getElementById('serverStatus');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = 'status' + (type ? ' ' + type : '');
    }
}

// ============================================================
// دالة أمان (منع هجمات XSS)
// ============================================================
function escapeHtml(value) {
    if (!value) return '';
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// ============================================================
// تصدير الدوال للاستخدام في الصفحات الأخرى
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        fetchAndDisplayEmployees,
        updateEmployeesTable,
        updateSalariesTable,
        editEmployee,
        deleteEmployee,
        getActiveCompanyId,
        getAuthToken
    };
}
