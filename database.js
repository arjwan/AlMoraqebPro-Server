// database.js
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// إنشاء الجداول تلقائياً عند بدء التشغيل
async function initDB() {
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
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Database tables initialized successfully.");
    } catch (err) {
        console.error("❌ Error initializing database tables:", err);
    }
}

module.exports = { pool, initDB };
