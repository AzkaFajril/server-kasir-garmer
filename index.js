const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: [
    'https://kasirtokogarmer.netlify.app',
    'http://localhost:5173'
  ],
  credentials: true
}));

app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Middleware JWT
const verifyToken = require('./middleware/authMiddleware');

// Routes
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

// ==========================
// PUBLIC
// ==========================
app.use('/api/auth', authRoutes);

// ==========================
// PROTECTED
// ==========================
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

app.get('/', (req, res) => {
  res.send('Server POS API Berjalan!');
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
  });
}

module.exports = app;