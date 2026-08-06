const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// إنشاء الجداول وتحديثها تلقائياً عند بدء التشغيل
async function initDB() {
    if (!process.env.DATABASE_URL) {
        console.log("⚠️ DATABASE_URL is not set. Skipping database initialization.");
        return;
    }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS companies (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(255) UNIQUE NOT NULL,
                company_name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                username VARCHAR(255) UNIQUE NOT NULL,
                phone VARCHAR(50),
                password VARCHAR(255),
                pass VARCHAR(255),
                role VARCHAR(50) DEFAULT 'employee',
                photo TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        // التأكد من إضافة الأعمدة في حال كان الجدول موجوداً مسبقاً ولم يتم إنشاؤه من جديد
        await pool.query(`
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS pass VARCHAR(255);
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'employee';
            ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo TEXT;
        `);

        console.log("✅ Database tables initialized and updated successfully.");
    } catch (err) {
        console.error("❌ Error initializing database tables:", err.message);
    }
}

module.exports = { pool, initDB };
