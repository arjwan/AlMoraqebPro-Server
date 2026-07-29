const { Client } = require('pg');

async function initializeSystem() {
    const adminClient = new Client({
        user: 'postgres',
        host: 'localhost',
        database: 'postgres',
        password: '1122',
        port: 5432,
    });

    try {
        await adminClient.connect();
        
        // التحقق من وجود قاعدة البيانات وإنشائها إن لم تكن موجودة
        const checkDb = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = 'almoraqeb_db'");
        if (checkDb.rows.length === 0) {
            console.log('⏳ جاري إنشاء قاعدة البيانات "almoraqeb_db"...');
            await adminClient.query('CREATE DATABASE almoraqeb_db');
            console.log('✅ تم إنشاء قاعدة البيانات بنجاح!');
        }
        await adminClient.end();

        // الاتصال بقاعدة البيانات almoraqeb_db وإنشاء الجداول
        const dbClient = new Client({
            user: 'postgres',
            host: 'localhost',
            database: 'almoraqeb_db',
            password: '1122',
            port: 5432,
        });

        await dbClient.connect();
        console.log('⏳ جاري إنشاء الجداول في قاعدة البيانات...');

        const createTablesQuery = `
            CREATE TABLE IF NOT EXISTS companies (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                subdomain VARCHAR(100) UNIQUE NOT NULL,
                status VARCHAR(50) DEFAULT 'active',
                subscription_end_date TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                company_id INT REFERENCES companies(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'employee',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await dbClient.query(createTablesQuery);
        console.log('🎉 تم إنشاء الجداول (companies و employees) بنجاح تام!');
        await dbClient.end();
        process.exit(0);

    } catch (err) {
        console.error('❌ حدث خطأ:', err.message);
        process.exit(1);
    }
}

initializeSystem();