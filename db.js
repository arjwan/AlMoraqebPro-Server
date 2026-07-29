const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'almoraqeb_db',
    password: process.env.DB_PASSWORD || '1122',
    port: process.env.DB_PORT || 5432,
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err.stack);
    } else {
        console.log('✅ تم الاتصال بقاعدة البيانات بنجاح!');
        release();
    }
});

module.exports = pool;