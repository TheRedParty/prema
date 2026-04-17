const express = require('express');
const session = require('express-session');
const cors = require('cors');
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

const db = require('./db');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');
const orgRoutes = require('./routes/orgs');
const adminRoutes = require('./routes/admin');
const path = require('path');
const fs = require('fs');
const uploadRoutes = require('./routes/uploads');

// Middleware
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'https://prema.red'],
  credentials: true
}));
app.use(express.json());

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // will be true in production
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
  }
}));

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Prema backend is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
