// File: server/index.js

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db/pool');

const app = express();

// =====================
// CORS
// =====================
const allowedOrigins = [
  'https://kasirtokogarmer.netlify.app',
  'http://localhost:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Mengizinkan request dari Postman/server dan origin yang terdaftar
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Middleware
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// =====================
// Routes
// =====================
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const productRoutes = require('./routes/productRoutes');
const orderRoutes = require('./routes/orderRoutes');
const stockRoutes = require('./routes/stockRoutes');
const reportRoutes = require('./routes/reportRoutes');
const userRoutes = require('./routes/userRoutes');
const hrRoutes = require('./routes/hrRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const profileRoutes = require('./routes/profileRoutes');
const expenseRoutes = require('./routes/expenseRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/expenses', expenseRoutes);

// Test endpoint
app.get('/', (req, res) => {
  res.send('Server POS API Berjalan!');
});

const PORT = process.env.PORT || 5000;

// Local
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  });
}

module.exports = app;