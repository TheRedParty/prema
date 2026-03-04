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


// Middleware
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
  credentials: true
}));
app.use(express.json());
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Cariño backend is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
