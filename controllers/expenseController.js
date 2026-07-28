const pool = require("../db/pool");

// ===============================
// 1. Ambil Semua Biaya Operasional
// ===============================
const getExpenses = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id,
                title,
                description,
                amount,
                TO_CHAR(expense_date, 'YYYY-MM-DD') AS expense_date,
                created_at,
                created_by,
                created_by AS created_by_name -- 👈 created_by sudah berisi nama user
            FROM operational_expenses
            ORDER BY expense_date DESC, id DESC
        `);

        res.status(200).json({
            success: true,
            data: result.rows
        });

    } catch (err) {
        console.error("Get Expenses Error:", err.message);

        res.status(500).json({
            success: false,
            message: "Gagal mengambil data biaya operasional"
        });
    }
};

// ===============================
// 2. Ambil Satu Data Berdasarkan ID
// ===============================
const getExpenseById = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(`
            SELECT
                id,
                title,
                description,
                amount,
                TO_CHAR(expense_date, 'YYYY-MM-DD') AS expense_date,
                created_at,
                created_by,
                created_by AS created_by_name
            FROM operational_expenses
            WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Data tidak ditemukan"
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });

    } catch (err) {
        console.error("Get Expense By ID Error:", err.message);

        res.status(500).json({
            success: false,
            message: "Terjadi kesalahan server"
        });
    }
};

// ===============================
// 3. Tambah Data (Create)
// ===============================
const createExpense = async (req, res) => {
    try {
        const {
            title,
            description,
            amount,
            expense_date,
            created_by,
            created_by_name
        } = req.body;

        // Ambil nama dari payload frontend atau req.user
        const userName = created_by || created_by_name || req.user?.name || "Kasir";

        const result = await pool.query(
            `
            INSERT INTO operational_expenses
            (
                title,
                description,
                amount,
                expense_date,
                created_by
            )
            VALUES($1, $2, $3, $4, $5)
            RETURNING 
                id, 
                title, 
                description, 
                amount, 
                TO_CHAR(expense_date, 'YYYY-MM-DD') AS expense_date, 
                created_by,
                created_by AS created_by_name
            `,
            [
                title,
                description,
                amount,
                expense_date,
                userName // 👈 Disimpan sebagai String Nama (misal: "boka")
            ]
        );

        res.status(201).json({
            success: true,
            message: "Biaya operasional berhasil ditambahkan",
            data: result.rows[0]
        });

    } catch (err) {
        console.error("Create Expense Error:", err.message);

        res.status(500).json({
            success: false,
            message: "Gagal menambahkan data"
        });
    }
};

// ===============================
// 4. Ubah Data (Update)
// ===============================
const updateExpense = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            title,
            description,
            amount,
            expense_date
        } = req.body;

        const result = await pool.query(
            `
            UPDATE operational_expenses
            SET
                title = $1,
                description = $2,
                amount = $3,
                expense_date = $4
            WHERE id = $5
            RETURNING 
                id, 
                title, 
                description, 
                amount, 
                TO_CHAR(expense_date, 'YYYY-MM-DD') AS expense_date,
                created_by
            `,
            [
                title,
                description,
                amount,
                expense_date,
                id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Data tidak ditemukan"
            });
        }

        res.json({
            success: true,
            message: "Data berhasil diubah",
            data: result.rows[0]
        });

    } catch (err) {
        console.error("Update Expense Error:", err.message);

        res.status(500).json({
            success: false,
            message: "Gagal mengubah data"
        });
    }
};

// ===============================
// 5. Hapus Data (Delete)
// ===============================
const deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `
            DELETE FROM operational_expenses
            WHERE id = $1
            RETURNING *
            `,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Data tidak ditemukan"
            });
        }

        res.json({
            success: true,
            message: "Data berhasil dihapus"
        });

    } catch (err) {
        console.error("Delete Expense Error:", err.message);

        res.status(500).json({
            success: false,
            message: "Gagal menghapus data"
        });
    }
};

module.exports = {
    getExpenses,
    getExpenseById,
    createExpense,
    updateExpense,
    deleteExpense
};