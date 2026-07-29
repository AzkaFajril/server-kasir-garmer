// File: server/middleware/uploadMiddleware.js
// Sebelumnya ini kemungkinan pakai multer diskStorage (simpan ke folder /uploads lokal).
// Sekarang diganti ke CloudinaryStorage supaya gambar tersimpan di Cloudinary,
// tapi cara pakainya di router TETAP SAMA: upload.single('image')

const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'kasir-produk', // nama folder di Cloudinary
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }],
    public_id: (req, file) => {
      const base = file.originalname
        .replace(/\.[^/.]+$/, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
      return `${base}-${Date.now()}`;
    },
  },
});

function fileFilter(req, file, cb) {
  const isImage = file.mimetype.startsWith('image/');
  if (!isImage) {
    return cb(new Error('File harus berupa gambar (jpg, png, webp)'), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // max 5MB
});

module.exports = upload;