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

// GET PENDING ORG REQUESTS
router.get('/org-requests', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT org_creation_requests.*, users.username, users.display_name
       FROM org_creation_requests
       JOIN users ON org_creation_requests.submitted_by = users.id
       WHERE org_creation_requests.status = 'pending'
       ORDER BY org_creation_requests.created_at DESC`
    );

    res.json({ requests: result.rows });

  } catch (err) {
    console.error('Get org requests error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// APPROVE AN ORG REQUEST
router.post('/org-requests/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const request = await db.query(
      'SELECT * FROM org_creation_requests WHERE id = $1',
      [req.params.id]
    );

    if (!request.rows.length) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const r = request.rows[0];
    const slug = r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Create the org
    const org = await db.query(
      `INSERT INTO orgs (name, slug, scope, description, values_statement, website, contact_email, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'approved', $8)
       RETURNING id`,
      [r.name, slug, r.scope, r.description, r.values_statement, r.website, r.contact_email, r.submitted_by]
    );

    // Make submitter the org admin
    await db.query(
      `INSERT INTO org_members (org_id, user_id, role, status)
       VALUES ($1, $2, 'admin', 'active')`,
      [org.rows[0].id, r.submitted_by]
    );

    // Mark request as approved
    await db.query(
      `UPDATE org_creation_requests SET status = 'approved', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [req.session.userId, req.params.id]
    );

    res.json({ message: 'Organization approved' });

  } catch (err) {
    console.error('Approve org error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// REJECT AN ORG REQUEST
router.post('/org-requests/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.query(
      `UPDATE org_creation_requests SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2`,
      [req.session.userId, req.params.id]
    );

    res.json({ message: 'Request rejected' });

  } catch (err) {
    console.error('Reject org error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;