// File: server/index.js

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// =======================
// ALLOWED ORIGINS
// =======================
const allowedOrigins = [
  'http://localhost:5173',
  'https://kasirtokogarmer.netlify.app'
];

// =======================
// BLOCK REQUEST DARI WEBSITE LAIN
// =======================
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Izinkan request tanpa Origin (misalnya health check dari server)
  if (!origin) {
    return next();
  }

  if (allowedOrigins.includes(origin)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied'
  });
});

// =======================
// CORS
// =======================
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use('/uploads', express.static('uploads'));

// =======================
// ROUTES
// =======================
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

const verifyToken = require('./middleware/authMiddleware');

app.use('/api/auth', authRoutes); // public

app.use('/api/categories', verifyToken, categoryRoutes);
app.use('/api/products', verifyToken, productRoutes);
app.use('/api/orders', verifyToken, orderRoutes);
app.use('/api/stock', verifyToken, stockRoutes);
app.use('/api/reports', verifyToken, reportRoutes);
app.use('/api/users', verifyToken, userRoutes);
app.use('/api/hr', verifyToken, hrRoutes);
app.use('/api/dashboard', verifyToken, dashboardRoutes);
app.use('/api/profile', verifyToken, profileRoutes);
app.use('/api/expenses', verifyToken, expenseRoutes);
// =======================
// TEST
// =======================
app.get('/', (req, res) => {
  res.send('Server POS API Berjalan!');
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  });
}

module.exports = app;