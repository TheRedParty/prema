const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in' });
  }
  next();
}

// GET ALL ORGS
router.get('/', async (req, res) => {
  const { scope, q } = req.query;

  try {
    let query = `
      SELECT orgs.*, 
        COUNT(org_members.id) FILTER (WHERE org_members.status = 'active') as member_count
      FROM orgs
      LEFT JOIN org_members ON orgs.id = org_members.org_id
      WHERE orgs.status = 'approved'
      AND orgs.is_removed = FALSE
    `;

    const params = [];
    let paramCount = 1;

    if (scope) {
      query += ` AND orgs.scope = $${paramCount}`;
      params.push(scope);
      paramCount++;
    }

    if (q) {
      query += ` AND (orgs.name ILIKE $${paramCount} OR orgs.description ILIKE $${paramCount})`;
      params.push(`%${q}%`);
      paramCount++;
    }

    query += ` GROUP BY orgs.id ORDER BY orgs.created_at DESC`;

    const result = await db.query(query, params);
    res.json({ orgs: result.rows });

  } catch (err) {
    console.error('Get orgs error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// GET SINGLE ORG
router.get('/:slug', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT orgs.*,
        COUNT(org_members.id) FILTER (WHERE org_members.status = 'active') as member_count
       FROM orgs
       LEFT JOIN org_members ON orgs.id = org_members.org_id
       WHERE orgs.slug = $1
       AND orgs.status = 'approved'
       AND orgs.is_removed = FALSE
       GROUP BY orgs.id`,
      [req.params.slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const org = result.rows[0];

    // Get announcements
    const announcements = await db.query(
      `SELECT org_announcements.*, users.display_name as author_name
       FROM org_announcements
       JOIN users ON org_announcements.author_id = users.id
       WHERE org_announcements.org_id = $1
       AND org_announcements.is_removed = FALSE
       ORDER BY org_announcements.created_at DESC`,
      [org.id]
    );

    // Get events
    const events = await db.query(
      `SELECT events.*,
        COUNT(event_rsvps.id) as rsvp_count
       FROM events
       LEFT JOIN event_rsvps ON events.id = event_rsvps.event_id
       WHERE events.org_id = $1
       AND events.is_removed = FALSE
       GROUP BY events.id
       ORDER BY events.created_at DESC`,
      [org.id]
    );

    res.json({
      org,
      announcements: announcements.rows,
      events: events.rows
    });

  } catch (err) {
    console.error('Get org error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// SUBMIT ORG CREATION REQUEST
router.post('/request', requireAuth, async (req, res) => {
  const { name, type, scope, description, website, contact_email, values_statement } = req.body;

  if (!name || !scope || !description || !values_statement) {
    return res.status(400).json({ error: 'Name, scope, description, and values statement are required' });
  }

  try {
    await db.query(
      `INSERT INTO org_creation_requests 
        (submitted_by, name, type, scope, description, website, contact_email, values_statement)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [req.session.userId, name, type, scope, description, website, contact_email, values_statement]
    );

    res.status(201).json({ message: 'Request submitted. An admin will review it shortly.' });

  } catch (err) {
    console.error('Org request error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// REQUEST TO JOIN AN ORG
router.post('/:id/join', requireAuth, async (req, res) => {
  try {
    const existing = await db.query(
      'SELECT * FROM org_members WHERE org_id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You are already a member or have a pending request' });
    }

    await db.query(
      'INSERT INTO org_members (org_id, user_id, role, status) VALUES ($1, $2, $3, $4)',
      [req.params.id, req.session.userId, 'member', 'pending']
    );

    res.status(201).json({ message: 'Join request submitted' });

  } catch (err) {
    console.error('Join org error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// GET MEMBERSHIP STATUS
router.get('/:id/membership', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM org_members WHERE org_id = $1 AND user_id = $2',
      [req.params.id, req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.json({ status: 'none' });
    }

    res.json({ status: result.rows[0].status, role: result.rows[0].role });

  } catch (err) {
    console.error('Membership status error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// RSVP TO AN EVENT
router.post('/:id/events/:eventId/rsvp', requireAuth, async (req, res) => {
  try {
    const membership = await db.query(
      'SELECT * FROM org_members WHERE org_id = $1 AND user_id = $2 AND status = $3',
      [req.params.id, req.session.userId, 'active']
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'You must be a member to RSVP' });
    }

    const event = await db.query('SELECT * FROM events WHERE id = $1', [req.params.eventId]);

    if (event.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const ev = event.rows[0];

    if (ev.capacity && ev.rsvp_count >= ev.capacity) {
      return res.status(400).json({ error: 'This event is full' });
    }

    await db.query(
      'INSERT INTO event_rsvps (event_id, user_id) VALUES ($1, $2)',
      [req.params.eventId, req.session.userId]
    );

    await db.query(
      'UPDATE events SET rsvp_count = rsvp_count + 1 WHERE id = $1',
      [req.params.eventId]
    );

    res.status(201).json({ message: 'RSVP confirmed' });

  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'You have already RSVPd to this event' });
    }
    console.error('RSVP error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// CANCEL RSVP
router.delete('/:id/events/:eventId/rsvp', requireAuth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2',
      [req.params.eventId, req.session.userId]
    );

    await db.query(
      'UPDATE events SET rsvp_count = GREATEST(rsvp_count - 1, 0) WHERE id = $1',
      [req.params.eventId]
    );

    res.json({ message: 'RSVP cancelled' });

  } catch (err) {
    console.error('Cancel RSVP error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// POST AN ANNOUNCEMENT (org admin only)
router.post('/:id/announcements', requireAuth, async (req, res) => {
  const { title, body } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required' });
  }

  try {
    const membership = await db.query(
      'SELECT * FROM org_members WHERE org_id = $1 AND user_id = $2 AND role = $3 AND status = $4',
      [req.params.id, req.session.userId, 'admin', 'active']
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'Only org admins can post announcements' });
    }

    await db.query(
      'INSERT INTO org_announcements (org_id, author_id, title, body) VALUES ($1, $2, $3, $4)',
      [req.params.id, req.session.userId, title, body]
    );

    res.status(201).json({ message: 'Announcement posted' });

  } catch (err) {
    console.error('Post announcement error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// REPORT AN ORG
router.post('/:id/report', requireAuth, async (req, res) => {
  const { reason, other_text } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'A reason is required' });
  }

  try {
    await db.query(
      `INSERT INTO reports (reporter_id, content_type, content_id, reason, other_text)
       VALUES ($1, 'org', $2, $3, $4)`,
      [req.session.userId, req.params.id, reason, other_text]
    );

    res.json({ message: 'Report submitted' });

  } catch (err) {
    console.error('Report org error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;