const pool = require('../db/pool');
const bcrypt = require('bcryptjs');

// 1. Dapatkan Data Profil
const getProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'User tidak ditemukan' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 2. Update Nama & Email (Khusus Admin)
const updateProfile = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email } = req.body;
        await pool.query('UPDATE users SET name = $1, email = $2 WHERE id = $3', [name, email, id]);
        res.json({ message: 'Profil berhasil diperbarui!' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 3. Ganti Password (verifikasi pakai password saat ini, tanpa OTP)
const changePassword = async (req, res) => {
    try {
        const { id, currentPassword, newPassword } = req.body;

        if (!id || !currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Data tidak lengkap' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Password baru minimal 6 karakter' });
        }

        const userQuery = await pool.query('SELECT password FROM users WHERE id = $1', [id]);
        const user = userQuery.rows[0];

        if (!user) {
            return res.status(404).json({ message: 'User tidak ditemukan' });
        }

        // Verifikasi password saat ini
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Password saat ini salah!' });
        }

        // Enkripsi password baru
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, id]);

        res.json({ message: 'Password berhasil diubah! Silakan login kembali.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getProfile, updateProfile, changePassword };