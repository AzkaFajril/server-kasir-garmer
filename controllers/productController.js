// File: server/controllers/productController.js

const pool = require('../db/pool');
const cloudinary = require('../config/cloudinary');

// Helper: hapus gambar dari Cloudinary (aman kalau public_id kosong)
async function destroyImage(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Gagal hapus gambar lama di Cloudinary:', err.message);
  }
}

// GET /api/products
exports.getProducts = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil data produk' });
  }
};

// GET /api/products/:id
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Produk tidak ditemukan' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal mengambil data produk' });
  }
};

// POST /api/products
exports.createProduct = async (req, res) => {
  try {
    const { name, category_id, price, stock, description, is_available } = req.body;

    if (!name || !category_id || price === undefined) {
      return res.status(400).json({ message: 'Nama, kategori, dan harga wajib diisi' });
    }

    // req.file berasal dari middleware upload (multer-storage-cloudinary)
    const image_url = req.file ? req.file.path : null;       // secure_url dari Cloudinary
    const image_public_id = req.file ? req.file.filename : null; // public_id dari Cloudinary

    const result = await pool.query(
      `INSERT INTO products
        (name, category_id, price, stock, description, is_available, image_url, image_public_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        name,
        category_id,
        price,
        stock || 0,
        description || null,
        is_available === 'true' || is_available === true,
        image_url,
        image_public_id,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    // kalau insert DB gagal tapi gambar sudah kepalang keupload, bersihkan
    if (req.file) await destroyImage(req.file.filename);
    res.status(500).json({ message: 'Gagal menambahkan produk' });
  }
};

// PUT /api/products/:id
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category_id, price, stock, description, is_available } = req.body;

    const existing = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      if (req.file) await destroyImage(req.file.filename);
      return res.status(404).json({ message: 'Produk tidak ditemukan' });
    }
    const old = existing.rows[0];

    let image_url = old.image_url;
    let image_public_id = old.image_public_id;

    // Kalau ada file baru diupload, hapus gambar lama & pakai yang baru
    if (req.file) {
      await destroyImage(old.image_public_id);
      image_url = req.file.path;
      image_public_id = req.file.filename;
    }

    const result = await pool.query(
      `UPDATE products SET
        name = $1,
        category_id = $2,
        price = $3,
        stock = $4,
        description = $5,
        is_available = $6,
        image_url = $7,
        image_public_id = $8
       WHERE id = $9
       RETURNING *`,
      [
        name,
        category_id,
        price,
        stock || 0,
        description || null,
        is_available === 'true' || is_available === true,
        image_url,
        image_public_id,
        id,
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Gagal memperbarui produk' });
  }
};

// DELETE /api/products/:id
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Produk tidak ditemukan' });
    }

    await destroyImage(existing.rows[0].image_public_id);
    await pool.query('DELETE FROM products WHERE id = $1', [id]);

    res.json({ message: 'Produk berhasil dihapus' });
  } catch (err) {
    console.error(err);
    // Kemungkinan besar produk masih dipakai relasi FK (mis. order_items)
    res.status(500).json({ message: 'Gagal menghapus produk, mungkin masih terpakai di transaksi lain' });
  }
};