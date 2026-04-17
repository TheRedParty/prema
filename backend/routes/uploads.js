const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${req.session.userId}-${Date.now()}${ext}`;
    cb(null, name);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase());
    cb(null, ok);
  }
});

// User avatar upload
router.post('/user', upload.single('avatar'), async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const avatarUrl = `/uploads/${req.file.filename}`;
  await db.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.session.userId]);
  res.json({ avatar_url: avatarUrl });
});

// Org avatar upload (admin only)
router.post('/org/:id', upload.single('avatar'), async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const orgId = req.params.id;
  const member = await db.query(
    'SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2',
    [orgId, req.session.userId]
  );
  if (!member.rows.length || member.rows[0].role !== 'admin') {
    return res.status(403).json({ error: 'Not an org admin' });
  }
  const avatarUrl = `/uploads/${req.file.filename}`;
  await db.query('UPDATE orgs SET avatar_url = $1 WHERE id = $2', [avatarUrl, orgId]);
  res.json({ avatar_url: avatarUrl });
});

module.exports = router;