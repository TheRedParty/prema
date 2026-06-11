const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in' });
  }
  next();
}

async function requireAdmin(req, res, next) {
  try {
    const result = await db.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (!result.rows.length || !result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong' });
  }
}

// GET DASHBOARD STATS
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [users, posts, reports, orgs] = await Promise.all([
      db.query('SELECT COUNT(*) FROM users'),
      db.query('SELECT COUNT(*) FROM posts WHERE is_active = TRUE'),
      db.query('SELECT COUNT(*) FROM reports WHERE status = $1', ['pending']),
      db.query('SELECT COUNT(*) FROM orgs WHERE status = $1', ['pending'])
    ]);

    res.json({
      totalUsers:    parseInt(users.rows[0].count),
      activePosts:   parseInt(posts.rows[0].count),
      pendingReports: parseInt(reports.rows[0].count),
      pendingOrgs:   parseInt(orgs.rows[0].count)
    });

  } catch (err) {
    console.error('Admin stats error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// GET ALL REPORTS
router.get('/reports', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT reports.*,
        reporter.username as reporter_username,
        reporter.display_name as reporter_name
       FROM reports
       JOIN users reporter ON reports.reporter_id = reporter.id
       WHERE reports.status = 'pending'
       ORDER BY reports.created_at DESC`
    );

    res.json({ reports: result.rows });

  } catch (err) {
    console.error('Get reports error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// RESOLVE A REPORT
router.patch('/reports/:id', requireAuth, requireAdmin, async (req, res) => {
  const { action, note } = req.body;

  try {
    await db.query(
      `UPDATE reports SET status = $1, resolved_by = $2, resolved_at = NOW(), resolution_note = $3
       WHERE id = $4`,
      [action, req.session.userId, note, req.params.id]
    );

    res.json({ message: 'Report resolved' });

  } catch (err) {
    console.error('Resolve report error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// REMOVE A POST
router.delete('/posts/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.query(
      'UPDATE posts SET is_removed = TRUE, is_active = FALSE WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Post removed' });

  } catch (err) {
    console.error('Remove post error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// BAN A USER
router.post('/users/:id/ban', requireAuth, requireAdmin, async (req, res) => {
  const { reason } = req.body;

  try {
    await db.query(
      'UPDATE users SET is_banned = TRUE, ban_reason = $1 WHERE id = $2',
      [reason, req.params.id]
    );

    // Remove all their active posts
    await db.query(
      'UPDATE posts SET is_active = FALSE WHERE user_id = $1',
      [req.params.id]
    );

    res.json({ message: 'User banned' });

  } catch (err) {
    console.error('Ban user error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// UNBAN A USER
router.post('/users/:id/unban', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.query(
      'UPDATE users SET is_banned = FALSE, ban_reason = NULL WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'User unbanned' });

  } catch (err) {
    console.error('Unban user error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// GET ALL USERS
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const { q } = req.query;

  try {
    let query = `
      SELECT id, username, display_name, email, location, is_admin, is_banned, ban_reason, created_at
      FROM users
    `;
    const params = [];

    if (q) {
      query += ` WHERE username ILIKE $1 OR email ILIKE $1 OR display_name ILIKE $1`;
      params.push(`%${q}%`);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query(query, params);
    res.json({ users: result.rows });

  } catch (err) {
    console.error('Get users error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});


module.exports = router;