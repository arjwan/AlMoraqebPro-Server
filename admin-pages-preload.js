const fs = require('fs');
const path = require('path');

/*
 * AlMoraqebPro admin navigation patch.
 * Keeps the existing dashboard design untouched and routes its cards
 * to smaller maintainable admin pages.
 */
(function patchAdminDashboardNavigation() {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    if (!fs.existsSync(adminPath)) return;

    let html = fs.readFileSync(adminPath, 'utf8');
    const marker = '<!-- ALMORAQEB_ADMIN_PAGE_SPLIT_V1 -->';
    if (html.includes(marker)) return;

    const replacements = [
        ["openSection('employeesSection')", "window.location.href='admin_employees.html'+window.location.search"],
        ["openSection('attendanceSection')", "window.location.href='admin_operations.html'+window.location.search"],
        ["openSection('salariesSection')", "window.location.href='admin_operations.html?tab=salaries&'+window.location.search.replace(/^\\?/, '')"],
        ["openSection('loansSection')", "window.location.href='admin_operations.html?tab=loans&'+window.location.search.replace(/^\\?/, '')"],
        ["openSection('shiftsSection')", "window.location.href='admin_operations.html?tab=shifts&'+window.location.search.replace(/^\\?/, '')"],
        ["openSection('reportsSection')", "window.location.href='admin_reports.html'+window.location.search"],
        ["openSection('gpsSection')", "window.location.href='admin_reports.html?tab=gps&'+window.location.search.replace(/^\\?/, '')"],
        ["openSection('servicesSection')", "window.location.href='admin_reports.html?tab=services&'+window.location.search.replace(/^\\?/, '')"],
        ["openSection('settingsSection')", "window.location.href='admin_reports.html?tab=settings&'+window.location.search.replace(/^\\?/, '')"],
        ["openSection('archiveSection')", "window.location.href='admin_reports.html?tab=archive&'+window.location.search.replace(/^\\?/, '')"],
        ["openSection('trackingSection')", "window.location.href='admin_reports.html?tab=gps&'+window.location.search.replace(/^\\?/, '')"],
        ["openSection('requestsSection')", "window.location.href='admin_employees.html?tab=requests&'+window.location.search.replace(/^\\?/, '')"]
    ];

    for (const [from, to] of replacements) {
        html = html.split(from).join(to);
    }

    html = html.replace('<body', marker + '\n<body');
    fs.writeFileSync(adminPath, html, 'utf8');
})();
