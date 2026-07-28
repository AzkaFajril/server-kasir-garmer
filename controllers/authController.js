// File: server/controllers/authController.js
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Fungsi Register (Untuk membuat akun pertama)
const register = async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        // 1. Hash (acak) password sebelum disimpan
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 2. Simpan ke database
        const newUser = await pool.query(
            'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
            [name, email, hashedPassword, role || 'kasir']
        );

        res.status(201).json({ message: 'User berhasil dibuat', user: newUser.rows[0] });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Fungsi Login (bisa pakai email ATAU nama)
const login = async (req, res) => {
    // Frontend bisa kirim "email" atau "name" atau "identifier"
    const { email, name, password, identifier } = req.body;

    // Tentukan apa yang dipakai untuk login
    const loginValue = identifier || email || name;

    if (!loginValue || !password) {
        return res.status(400).json({ message: 'Email/Nama dan password wajib diisi' });
    }

    try {
        // Cari user berdasarkan email ATAU name
        const userResult = await pool.query(
            'SELECT * FROM users WHERE email = $1 OR name = $1',
            [loginValue]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Email atau Nama tidak ditemukan' });
        }

        const user = userResult.rows[0];

        // Cocokkan password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Password salah' });
        }

        // Buat JWT Token
        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        // Kirim token ke frontend
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { register, login };