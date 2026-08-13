const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');

/*
 * AlMoraqebPro runtime enhancements.
 * This preload keeps the existing server.js intact while adding:
 * 1) a protected employee-delete API;
 * 2) a professional employee-card UI injected into admin.html at startup.
 */

function readToken(token) {
    const secret = process.env.SESSION_SECRET || process.env.DEVELOPER_PASSWORD;
    if (!secret || !token || !token.includes('.')) return null;

    const [body, signature] = token.split('.');
    if (!body || !signature) return null;

    const expected = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('base64url');

    if (signature.length !== expected.length) return null;

    try {
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
            return null;
        }

        const payload = JSON.parse(
            Buffer.from(body, 'base64url').toString()
        );

        return payload.exp > Date.now() ? payload : null;
    } catch {
        return null;
    }
}

function getBearer(req) {
    return String(req.headers.authorization || '')
        .replace(/^Bearer\s+/i, '')
        .trim();
}

/* ---------------------------------------------------------
   Protected delete endpoint
   --------------------------------------------------------- */
const originalListen = express.application.listen;

if (!express.application.__almoraqebDeletePatch) {
    express.application.__almoraqebDeletePatch = true;

    express.application.listen = function (...args) {
        const app = this;

        if (!app.__almoraqebEmployeeDeleteRoute) {
            app.__almoraqebEmployeeDeleteRoute = true;

            app.delete('/api/employees/:employeeId', async (req, res) => {
                try {
                    const token = readToken(getBearer(req));

                    if (!token || token.role !== 'admin' || !token.companyId) {
                        return res.status(401).json({
                            success: false,
                            message: 'جلسة المدير غير صالحة'
                        });
                    }

                    const employeeId = String(req.params.employeeId || '').trim();
                    if (!employeeId) {
                        return res.status(400).json({
                            success: false,
                            message: 'معرف الموظف مطلوب'
                        });
                    }

                    const Employee = require('mongoose').model('Employee');
                    const Attendance = require('mongoose').model('Attendance');
                    const ServiceRequest = require('mongoose').model('ServiceRequest');
                    const Notification = require('mongoose').model('Notification');
                    const EmployeeRequest = require('mongoose').model('EmployeeRequest');

                    const employee = await Employee.findById(employeeId);

                    if (!employee || String(employee.companyId) !== String(token.companyId)) {
                        return res.status(404).json({
                            success: false,
                            message: 'الموظف غير موجود في شركة المدير الحالية'
                        });
                    }

                    const employeeName = employee.name || '';
                    const companyId = employee.companyId;

                    await Promise.all([
                        Attendance.deleteMany({ employeeId: String(employee._id), companyId }),
                        ServiceRequest.deleteMany({ employeeId: String(employee._id), companyId }),
                        Notification.deleteMany({ employeeId: String(employee._id), companyId }),
                        EmployeeRequest.deleteMany({
                            companyId,
                            deviceId: employee.deviceId || '__no_device__',
                            status: { $ne: 'approved' }
                        })
                    ]);

                    await Employee.deleteOne({ _id: employee._id, companyId });

                    return res.json({
                        success: true,
                        message: `تم حذف الموظف ${employeeName || ''} وجميع سجلاته المرتبطة بنجاح`,
                        employeeId: String(employee._id),
                        companyId
                    });
                } catch (error) {
                    console.error('❌ Employee delete:', error);
                    return res.status(500).json({
                        success: false,
                        message: 'تعذر حذف الموظف',
                        error: error.message
                    });
                }
            });
        }

        return originalListen.apply(app, args);
    };
}

/* ---------------------------------------------------------
   Professional employee-management UI patch
   --------------------------------------------------------- */
function patchAdminHtml() {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    if (!fs.existsSync(adminPath)) return;

    let html = fs.readFileSync(adminPath, 'utf8');

    const styleMarker = '/* ALMORAQEB_EMPLOYEE_PRO_V1 */';
    const scriptMarker = '/* ALMORAQEB_EMPLOYEE_PRO_JS_V1 */';

    if (!html.includes(styleMarker)) {
        const css = `
${styleMarker}
.employee-pro-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 16px;padding:14px;background:linear-gradient(135deg,#f8fafc,#eef6ff);border:1px solid #dbeafe;border-radius:16px;direction:rtl}
.employee-pro-search{flex:1;min-width:240px!important;height:44px!important;border:1px solid #cbd5e1!important;border-radius:12px!important;background:#fff!important;padding:0 14px!important;box-shadow:0 2px 8px rgba(15,23,42,.05)}
.employee-pro-filter{height:44px!important;min-width:150px;border:1px solid #cbd5e1!important;border-radius:12px!important;background:#fff!important}
.employee-pro-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;direction:rtl}
.employee-pro-stat{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px;box-shadow:0 3px 12px rgba(15,23,42,.05)}
.employee-pro-stat small{display:block;color:#64748b;font-weight:700;font-size:11px;margin-bottom:4px}.employee-pro-stat b{font-size:22px;color:#0f172a}
.employee-pro-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px;direction:rtl}
.employee-pro-card{position:relative;overflow:hidden;background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:18px;box-shadow:0 8px 24px rgba(15,23,42,.07);transition:.22s ease;direction:rtl;text-align:right}
.employee-pro-card:hover{transform:translateY(-3px);box-shadow:0 14px 34px rgba(2,132,199,.13);border-color:#bae6fd}
.employee-pro-top{display:flex;align-items:center;gap:12px;padding-bottom:14px;border-bottom:1px solid #eef2f7}.employee-pro-avatar{width:58px;height:58px;border-radius:16px;object-fit:cover;background:#e0f2fe;display:flex;align-items:center;justify-content:center;font-size:25px;font-weight:900;color:#0369a1;flex:0 0 58px}
.employee-pro-name{font-size:17px;font-weight:900;color:#0f172a;margin-bottom:4px}.employee-pro-role{font-size:12px;color:#64748b;font-weight:700}.employee-pro-status{margin-right:auto;padding:5px 9px;border-radius:999px;font-size:10px;font-weight:900;white-space:nowrap}.employee-pro-status.active{background:#dcfce7;color:#166534}.employee-pro-status.pending{background:#fef3c7;color:#92400e}.employee-pro-status.off{background:#fee2e2;color:#991b1b}
.employee-pro-meta{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:14px 0}.employee-pro-meta-item{background:#f8fafc;border:1px solid #edf2f7;border-radius:11px;padding:9px}.employee-pro-meta-item small{display:block;color:#64748b;font-size:10px;font-weight:800;margin-bottom:3px}.employee-pro-meta-item span{display:block;color:#1e293b;font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.employee-pro-device{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#f8fafc;border-radius:11px;padding:9px 11px;margin-bottom:12px;font-size:11px}.employee-pro-device strong{font-size:11px}.employee-pro-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}.employee-pro-action{border:0;border-radius:10px;padding:9px 6px;font-size:11px;font-weight:900;cursor:pointer;transition:.18s}.employee-pro-action:hover{transform:translateY(-1px);filter:brightness(.97)}.employee-pro-view{background:#e0f2fe;color:#075985}.employee-pro-device-btn{background:#fef3c7;color:#92400e}.employee-pro-delete{background:#fee2e2;color:#991b1b}.employee-pro-empty{padding:45px 20px;text-align:center;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:16px;color:#64748b;font-weight:800;direction:rtl}
.employee-pro-confirm{width:min(480px,94vw)!important}.employee-pro-danger-icon{width:58px;height:58px;border-radius:18px;background:#fee2e2;color:#b91c1c;display:flex;align-items:center;justify-content:center;font-size:25px;margin:0 auto 12px}
@media(max-width:900px){.employee-pro-stats{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.employee-pro-grid{grid-template-columns:1fr}.employee-pro-stats{grid-template-columns:1fr 1fr}.employee-pro-actions{grid-template-columns:1fr 1fr}.employee-pro-actions .employee-pro-delete{grid-column:span 2}}
body.dark-mode .employee-pro-toolbar,body.dark-mode .employee-pro-stat,body.dark-mode .employee-pro-card,body.dark-mode .employee-pro-meta-item,body.dark-mode .employee-pro-device{background:#0f172a;border-color:#334155}body.dark-mode .employee-pro-name,body.dark-mode .employee-pro-meta-item span,body.dark-mode .employee-pro-stat b{color:#f8fafc}body.dark-mode .employee-pro-role,body.dark-mode .employee-pro-meta-item small,body.dark-mode .employee-pro-stat small{color:#94a3b8}
`;
        html = html.replace('</head>', `<style>${css}</style>\n</head>`);
    }

    if (!html.includes(scriptMarker)) {
        const js = `
<script>
${scriptMarker}
(function(){
    const originalOpenEmployeeModal = window.openEmployeeModal;

    function employeeInitial(employee){
        const name = String(employee.name || 'م').trim();
        return name ? name.charAt(0).toUpperCase() : 'م';
    }

    function employeeStatus(employee){
        if (employee.credentialsStatus === 'active') return ['active','نشط'];
        return ['pending','بانتظار التفعيل'];
    }

    function employeeCardHtml(employee){
        const [statusClass,statusText] = employeeStatus(employee);
        const photo = employee.photoUrl ? String(employee.photoUrl) : '';
        const avatar = photo
            ? '<img class="employee-pro-avatar" src="'+escapeHtml(photo)+'" alt="">'
            : '<div class="employee-pro-avatar">'+escapeHtml(employeeInitial(employee))+'</div>';
        const device = employee.deviceId
            ? '📱 مرتبط بجهاز'
            : '⚪ لا يوجد جهاز مرتبط';

        return '<article class="employee-pro-card">'
            + '<div class="employee-pro-top">'
            + avatar
            + '<div style="min-width:0"><div class="employee-pro-name">'+escapeHtml(employee.name || 'بدون اسم')+'</div>'
            + '<div class="employee-pro-role">'+escapeHtml(employee.specialty || 'موظف')+'</div></div>'
            + '<span class="employee-pro-status '+statusClass+'">'+statusText+'</span>'
            + '</div>'
            + '<div class="employee-pro-meta">'
            + '<div class="employee-pro-meta-item"><small>البريد</small><span>'+escapeHtml(employee.email || '—')+'</span></div>'
            + '<div class="employee-pro-meta-item"><small>اسم المستخدم</small><span>'+escapeHtml(employee.username || 'غير محدد')+'</span></div>'
            + '<div class="employee-pro-meta-item"><small>الراتب</small><span>'+formatMoney(employee.salary)+'</span></div>'
            + '<div class="employee-pro-meta-item"><small>مكان العمل</small><span>'+escapeHtml(employee.workplace || '—')+'</span></div>'
            + '</div>'
            + '<div class="employee-pro-device"><strong>'+device+'</strong><span>'+escapeHtml(employee.deviceId ? String(employee.deviceId).slice(0,12)+'…' : '')+'</span></div>'
            + '<div class="employee-pro-actions">'
            + '<button class="employee-pro-action employee-pro-view" onclick="viewEmployee(\''+String(employee._id)+'\')">👁️ التفاصيل</button>'
            + '<button class="employee-pro-action employee-pro-device-btn" onclick="resetEmployeeDevice(\''+String(employee._id)+'\')">📱 الجهاز</button>'
            + '<button class="employee-pro-action employee-pro-delete" onclick="confirmDeleteEmployee(\''+String(employee._id)+'\')">🗑️ حذف</button>'
            + '</div></article>';
    }

    window.renderEmployees = function(){
        const section = document.getElementById('employeesSection');
        const body = document.getElementById('empTableBody');
        if (!section || !body) return;

        let toolbar = document.getElementById('employeeProToolbar');
        if (!toolbar) {
            const oldBar = section.querySelector('.filter-bar');
            if (oldBar) oldBar.style.display = 'none';
            toolbar = document.createElement('div');
            toolbar.id = 'employeeProToolbar';
            toolbar.className = 'employee-pro-toolbar';
            toolbar.innerHTML = '<input id="employeeProSearch" class="employee-pro-search" placeholder="🔎 ابحث بالاسم أو القسم أو المستخدم أو البريد...">'
                + '<select id="employeeProStatus" class="employee-pro-filter"><option value="all">كل الحالات</option><option value="active">نشط</option><option value="pending">بانتظار التفعيل</option><option value="device">مرتبط بجهاز</option><option value="nodevice">بدون جهاز</option></select>'
                + '<button class="btn btn-primary" onclick="openEmployeeModal()">➕ إضافة موظف</button>'
                + '<button class="btn btn-success" onclick="loadEmployeesFromMongoDB()">🔄 تحديث</button>';
            const stats = document.createElement('div');
            stats.id = 'employeeProStats';
            stats.className = 'employee-pro-stats';
            const container = section.querySelector('.table-container');
            section.insertBefore(toolbar, container);
            section.insertBefore(stats, container);
            if (container) container.style.display = 'none';

            toolbar.querySelector('#employeeProSearch').addEventListener('input', renderEmployeeCards);
            toolbar.querySelector('#employeeProStatus').addEventListener('change', renderEmployeeCards);
        }

        renderEmployeeCards();
    };

    window.renderEmployeeCards = function(){
        const section = document.getElementById('employeesSection');
        if (!section) return;
        let grid = document.getElementById('employeeProGrid');
        if (!grid) {
            grid = document.createElement('div');
            grid.id = 'employeeProGrid';
            grid.className = 'employee-pro-grid';
            section.appendChild(grid);
        }

        const search = String(document.getElementById('employeeProSearch')?.value || '').trim().toLowerCase();
        const status = document.getElementById('employeeProStatus')?.value || 'all';
        let list = Array.isArray(window.employeesCache) ? window.employeesCache : [];
        if (!list.length && typeof employeesCache !== 'undefined') list = employeesCache;

        const filtered = list.filter(e => {
            const hay = [e.name,e.email,e.username,e.specialty,e.workplace,e.companyId].filter(Boolean).join(' ').toLowerCase();
            if (search && !hay.includes(search)) return false;
            if (status === 'active' && e.credentialsStatus !== 'active') return false;
            if (status === 'pending' && e.credentialsStatus !== 'pending') return false;
            if (status === 'device' && !e.deviceId) return false;
            if (status === 'nodevice' && e.deviceId) return false;
            return true;
        });

        const active = list.filter(e => e.credentialsStatus === 'active').length;
        const devices = list.filter(e => !!e.deviceId).length;
        const pending = list.filter(e => e.credentialsStatus !== 'active').length;
        const stats = document.getElementById('employeeProStats');
        if (stats) stats.innerHTML = '<div class="employee-pro-stat"><small>إجمالي الموظفين</small><b>'+list.length+'</b></div>'
            + '<div class="employee-pro-stat"><small>الحسابات النشطة</small><b>'+active+'</b></div>'
            + '<div class="employee-pro-stat"><small>مرتبطون بأجهزة</small><b>'+devices+'</b></div>'
            + '<div class="employee-pro-stat"><small>بانتظار التفعيل</small><b>'+pending+'</b></div>';

        grid.innerHTML = filtered.length
            ? filtered.map(employeeCardHtml).join('')
            : '<div class="employee-pro-empty" style="grid-column:1/-1">📭 لا توجد نتائج مطابقة للبحث الحالي</div>';
    };

    window.confirmDeleteEmployee = function(employeeId){
        const employee = (typeof employeesCache !== 'undefined' ? employeesCache : []).find(e => String(e._id) === String(employeeId));
        if (!employee) return alert('❌ الموظف غير موجود');

        let modal = document.getElementById('employeeDeleteModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'employeeDeleteModal';
            modal.className = 'modal-overlay';
            modal.innerHTML = '<div class="modal-card compact employee-pro-confirm"><div class="modal-header"><h3>⚠️ حذف موظف</h3><button class="modal-close" onclick="closeEmployeeDeleteModal()">✕</button></div><div class="modal-body" style="text-align:center"><div class="employee-pro-danger-icon">🗑️</div><h3 id="employeeDeleteTitle"></h3><p style="margin:10px 0 18px;color:#64748b;line-height:1.7">سيتم حذف الموظف وسجلات الحضور والطلبات والإشعارات المرتبطة به من قاعدة البيانات. لا يمكن التراجع عن هذه العملية.</p><div style="display:flex;gap:8px;justify-content:center"><button class="btn" style="background:#e2e8f0" onclick="closeEmployeeDeleteModal()">إلغاء</button><button class="btn btn-danger" id="employeeDeleteConfirmBtn">🗑️ تأكيد الحذف</button></div></div></div>';
            document.body.appendChild(modal);
        }
        document.getElementById('employeeDeleteTitle').textContent = 'هل تريد حذف '+(employee.name || 'هذا الموظف')+'؟';
        document.getElementById('employeeDeleteConfirmBtn').onclick = () => deleteEmployee(employeeId);
        modal.classList.add('open');
    };

    window.closeEmployeeDeleteModal = function(){
        document.getElementById('employeeDeleteModal')?.classList.remove('open');
    };

    window.deleteEmployee = async function(employeeId){
        const button = document.getElementById('employeeDeleteConfirmBtn');
        if (button) { button.disabled = true; button.textContent = '⏳ جارٍ الحذف...'; }
        try {
            const response = await fetch(API_BASE+'/api/employees/'+encodeURIComponent(employeeId), {
                method:'DELETE',
                headers:{Authorization:'Bearer '+getAdminToken(),Accept:'application/json'}
            });
            const data = await response.json().catch(()=>({}));
            if (!response.ok || !data.success) throw new Error(data.message || data.error || 'تعذر حذف الموظف');
            closeEmployeeDeleteModal();
            alert('✅ '+data.message);
            await loadEmployeesFromMongoDB();
            if (typeof updateDashboardStats === 'function') updateDashboardStats();
        } catch(error) {
            alert('❌ '+error.message);
        } finally {
            if (button) { button.disabled = false; button.textContent = '🗑️ تأكيد الحذف'; }
        }
    };

    window.filterEmployees = function(){ renderEmployees(); };

    window.addEventListener('load', function(){
        setTimeout(function(){ if (typeof renderEmployees === 'function') renderEmployees(); }, 50);
    });
})();
</script>
`;
        html = html.replace('</body>', `${js}</body>`);
    }

    fs.writeFileSync(adminPath, html, 'utf8');
}

try {
    patchAdminHtml();
} catch (error) {
    console.error('⚠️ AlMoraqebPro admin UI patch:', error.message);
}
