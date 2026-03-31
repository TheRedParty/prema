const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware to check if logged in
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in' });
  }
  next();
}

// GET ALL POSTS
router.get('/', async (req, res) => {
  const { scope, category, type, q } = req.query;

  try {
    let query = `
      SELECT posts.*, users.username, users.display_name, users.location as user_location
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.is_active = TRUE
      AND posts.is_removed = FALSE
      AND users.is_banned = FALSE
    `;

    const params = [];
    let paramCount = 1;

    if (scope) {
      query += ` AND posts.scope = $${paramCount}`;
      params.push(scope);
      paramCount++;
    }

    if (category && category !== 'all') {
      query += ` AND posts.category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (type && type !== 'all') {
      query += ` AND posts.type = $${paramCount}`;
      params.push(type);
      paramCount++;
    }

    if (q) {
      query += ` AND (posts.title ILIKE $${paramCount} OR posts.body ILIKE $${paramCount})`;
      params.push(`%${q}%`);
      paramCount++;
    }

    query += ` ORDER BY posts.created_at DESC`;

    const result = await db.query(query, params);
    res.json({ posts: result.rows });

  } catch (err) {
    console.error('Get posts error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// CREATE A POST
router.post('/', requireAuth, async (req, res) => {
  const { type, scope, category, title, body, location, latitude, longitude } = req.body;

  if (!type || !scope || !category || !title || !body) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const result = await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body, location, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.session.userId, type, scope, category, title, body, location, latitude || null, longitude || null]
    );

    res.status(201).json({ post: result.rows[0] });

  } catch (err) {
    console.error('Create post error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// GET SINGLE POST
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT posts.*, users.username, users.display_name, users.location as user_location
       FROM posts
       JOIN users ON posts.user_id = users.id
       WHERE posts.id = $1
       AND posts.is_removed = FALSE`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ post: result.rows[0] });

  } catch (err) {
    console.error('Get post error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// DELETE A POST
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM posts WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = result.rows[0];

    if (post.user_id !== req.session.userId) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    await db.query('UPDATE posts SET is_active = FALSE WHERE id = $1', [req.params.id]);

    res.json({ message: 'Post deleted' });

  } catch (err) {
    console.error('Delete post error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// REPORT A POST
router.post('/:id/report', requireAuth, async (req, res) => {
  const { reason, other_text } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'A reason is required' });
  }

  try {
    await db.query(
      `INSERT INTO reports (reporter_id, content_type, content_id, reason, other_text)
       VALUES ($1, 'post', $2, $3, $4)`,
      [req.session.userId, req.params.id, reason, other_text]
    );

    // Increment report count
    await db.query(
      'UPDATE posts SET report_count = report_count + 1 WHERE id = $1',
      [req.params.id]
    );

    // Auto-remove at 5 reports
    await db.query(
      'UPDATE posts SET is_removed = TRUE WHERE id = $1 AND report_count >= 5',
      [req.params.id]
    );

    res.json({ message: 'Report submitted' });

  } catch (err) {
    console.error('Report error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});




module.exports = router;