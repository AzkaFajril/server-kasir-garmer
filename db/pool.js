const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // Tambahkan baris ini agar PostgreSQL otomatis menggunakan zona waktu WIB (GMT+7)
  options: "-c timezone=Asia/Jakarta",
  ssl: process.env.DB_HOST.includes("render.com")
    ? { rejectUnauthorized: false }
    : false,
});

module.exports = pool;