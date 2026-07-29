// ==========================================
// CONTROLLER: ordersController.js
// ==========================================
const pool = require('../db/pool');

const createOrder = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { user_id, subtotal, discount, total, payment_method, amount_paid, change_amount, notes, items } = req.body;

        // Mengambil waktu lokal dari Node.js khusus untuk format nomor order (ORD-YYYYMMDD-XXXX)
        const date = new Date();
        const dateString = date.toISOString().split('T')[0].replace(/-/g, '');
        const randomString = Math.floor(1000 + Math.random() * 9000);
        const order_number = `ORD-${dateString}-${randomString}`;

        // QRIS/Non-tunai kini langsung berstatus 'completed' tanpa perlu Xendit
        const status = 'completed';

        // Proses Xendit dinonaktifkan (dihapus)

        // Kembali menggunakan struktur kolom standar, biarkan database mengisi waktu otomatis (jika ada default) 
        // atau gunakan CURRENT_TIMESTAMP agar aman dari error kolom tidak ditemukan.
        const orderResult = await client.query(
            `INSERT INTO orders (user_id, order_number, subtotal, discount, total, payment_method, amount_paid, change_amount, notes, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id, order_number`,
            [user_id, order_number, subtotal, discount, total, payment_method, amount_paid || total, change_amount || 0, notes, status]
        );
        const order = orderResult.rows[0];

        for (let item of items) {
            const itemQty = Number(item.qty || item.quantity || 1);
            const itemPrice = Number(item.price || 0);

            await client.query(
                `INSERT INTO order_items (order_id, product_id, product_name, price, quantity, subtotal)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [order.id, item.product_id, item.name || item.product_name, itemPrice, itemQty, itemPrice * itemQty]
            );
            await client.query(`UPDATE products SET stock = stock - $1 WHERE id = $2`, [itemQty, item.product_id]);
        }
        
        await client.query('COMMIT');

        res.status(201).json({
            message: 'Transaksi berhasil',
            order_id: order.id,
            order_number: order.order_number
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Order Error: ", error.message);
        res.status(500).json({ message: error.message });
    } finally {
        client.release();
    }
};

const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const orderQuery = await pool.query(
            `SELECT o.*, u.name as cashier_name 
             FROM orders o 
             LEFT JOIN users u ON o.user_id = u.id 
             WHERE o.id = $1`, 
            [id]
        );
        
        if (orderQuery.rows.length === 0) return res.status(404).json({ message: 'Order tidak ditemukan' });

        const itemsQuery = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [id]);
        
        res.json({
            ...orderQuery.rows[0],
            items: itemsQuery.rows
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getOrderHistory = async (req, res) => {
    const { user_id } = req.params;
    try {
        const query = `
            SELECT o.*, 
            COALESCE(
                (SELECT json_agg(json_build_object('name', oi.product_name, 'qty', oi.quantity)) 
                 FROM order_items oi WHERE oi.order_id = o.id), 
                '[]'
            ) as items
            FROM orders o 
            WHERE o.user_id = $1 
            ORDER BY o.created_at DESC
        `;
        const result = await pool.query(query, [user_id]);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getAllOrders = async (req, res) => {
    try {
        const query = `
            SELECT o.*, u.name as cashier_name,
            COALESCE(
                (SELECT json_agg(json_build_object('name', oi.product_name, 'qty', oi.quantity)) 
                 FROM order_items oi WHERE oi.order_id = o.id), 
                '[]'
            ) as items
            FROM orders o 
            LEFT JOIN users u ON o.user_id = u.id 
            ORDER BY o.created_at DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await pool.query('UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [status, id]);
        res.json({ message: 'Status transaksi diperbarui' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const checkOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT status FROM orders WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Order tidak ditemukan' });
        
        res.json({ status: result.rows[0].status });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const xenditWebhook = async (req, res) => {
    try {
        const { data, event } = req.body;
        if (event === 'qr.payment' && data.status === 'COMPLETED') {
            const order_number = data.reference_id;
            await pool.query(
                'UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_number = $2', 
                ['completed', order_number]
            );
        }
        res.status(200).json({ message: 'Webhook received successfully' });
    } catch (error) {
        console.error('Webhook Error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = { createOrder, getOrderById, getOrderHistory, getAllOrders, updateOrderStatus, checkOrderStatus, xenditWebhook };