const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const COMPANIES_DIR = path.join(DATA_DIR, 'companies');
const MAIN_DB_PATH = path.join(DATA_DIR, 'almaqeb_pro.db');

console.log('🧹 بدء عملية تنظيف البيانات التجريبية من الهارد دسك...');

try {
    // 1. إعادة تعيين قاعدة البيانات الرئيسية لترجع فارغة
    if (fs.existsSync(MAIN_DB_PATH)) {
        fs.writeFileSync(MAIN_DB_PATH, JSON.stringify({ companies: [] }, null, 2));
        console.log('✅ تم تصفية قاعدة البيانات الرئيسية (almaqeb_pro.db) بنجاح.');
    }

    // 2. حذف مجلدات الشركات القديمة فقط داخل data/companies دون المساس بباقي المشروع
    if (fs.existsSync(COMPANIES_DIR)) {
        const companies = fs.readdirSync(COMPANIES_DIR);
        companies.forEach(companyFolder => {
            const folderPath = path.join(COMPANIES_DIR, companyFolder);
            fs.rmSync(folderPath, { recursive: true, force: true });
            console.log(`🗑️ تم حذف مجلد الشركة القديمة: ${companyFolder}`);
        });
        console.log('✅ تم تنظيف مجلد الشركات بالكامل.');
    }

    console.log('✨ اكتملت العملية بنجاح! النظام الآن نظيف وجاهز لإضافة "شركة الأرجوان" ببياناتها الجديدة.');
} catch (error) {
    console.error('❌ حدث خطأ أثناء تنظيف البيانات:', error);
}
