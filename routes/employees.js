const express = require('express');

module.exports = (pool) => {
    const router = express.Router();

    // جلب جميع الموظفين
    router.get('/', async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM employees ORDER BY id DESC');
            res.json(result.rows);
        } catch (err) {
            console.error(err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // إضافة موظف جديد
    router.post('/', async (req, res) => {
        try {
            const { name, email, phone } = req.body;
            const newEmployee = await pool.query(
                'INSERT INTO employees (name, email, phone) VALUES ($1, $2, $3) RETURNING *',
                [name, email, phone]
            );
            res.json(newEmployee.rows[0]);
        } catch (err) {
            console.error(err.message);
            res.status(500).json({ error: 'Server error' });
        }
    });

    return router;
};
