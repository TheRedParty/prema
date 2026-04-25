const express = require('express');
const router = express.Router();
const db = require('../db');
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
      WHERE orgs.status = 'active'
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
       AND orgs.status = 'active'
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

    // Get events with their open needs counts
    const events = await db.query(
      `SELECT events.*,
        COUNT(DISTINCT event_rsvps.id) as rsvp_count,
        COUNT(DISTINCT posts.id) FILTER (
          WHERE posts.type = 'need'
          AND posts.is_active = TRUE
          AND posts.is_removed = FALSE
          AND posts.claimed_by IS NULL
          AND posts.fulfilled_at IS NULL
        ) as open_needs_count
       FROM events
       LEFT JOIN event_rsvps ON events.id = event_rsvps.event_id
       LEFT JOIN posts ON posts.event_id = events.id
       WHERE events.org_id = $1
       AND events.is_removed = FALSE
       GROUP BY events.id
       ORDER BY events.created_at DESC`,
      [org.id]
    );

    // Get total open needs for the org (general + event-linked)
    const openNeeds = await db.query(
      `SELECT COUNT(*) as count
       FROM posts
       WHERE posts.org_id = $1
       AND posts.type = 'need'
       AND posts.is_active = TRUE
       AND posts.is_removed = FALSE
       AND posts.claimed_by IS NULL
       AND posts.fulfilled_at IS NULL`,
      [org.id]
    );

    res.json({
      org: {
        ...org,
        open_needs_count: Number(openNeeds.rows[0].count)
      },
      announcements: announcements.rows,
      events: events.rows
    });

  } catch (err) {
    console.error('Get org error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// CREATE A NEW ORG (contribution-based, no moderation)
router.post('/', requireAuth, async (req, res) => {
  const {
    name,
    description,
    scope,
    location,
    contact_email,
    values_statement,
    website,
    contribution_dollars,
  } = req.body;

  if (!name || !scope || !description) {
    return res.status(400).json({ error: 'Name, scope, and description are required' });
  }

  // Validate & normalize contribution amount
  let contribDollars = parseInt(contribution_dollars, 10);
  if (isNaN(contribDollars) || contribDollars < 0) contribDollars = 0;
  const contribCents = contribDollars * 100;

  // Generate a URL slug from the name
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (!baseSlug) {
    return res.status(400).json({ error: 'Name must contain at least one letter or number' });
  }

  // Ensure slug uniqueness by appending -2, -3, etc. if needed
  let slug = baseSlug;
  let suffix = 2;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await db.query('SELECT id FROM orgs WHERE slug = $1', [slug]);
    if (existing.rows.length === 0) break;
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  // If contribution is $0, org goes active immediately. Otherwise, pending_payment.
  const status = contribDollars === 0 ? 'active' : 'pending_payment';

  try {
    const orgResult = await db.query(
      `INSERT INTO orgs
        (name, slug, scope, description, location, contact_email, values_statement, website,
         status, created_by, contribution_amount_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, slug, status`,
      [
        name, slug, scope, description, location, contact_email, values_statement, website,
        status, req.session.userId, contribCents
      ]
    );

    const org = orgResult.rows[0];

    // Make the submitter an active admin of their own org
    await db.query(
      `INSERT INTO org_members (org_id, user_id, role, status)
       VALUES ($1, $2, 'admin', 'active')`,
      [org.id, req.session.userId]
    );

    res.status(201).json({
      orgId: org.id,
      slug: org.slug,
      status: org.status,
      contributionDollars: contribDollars,
    });

  } catch (err) {
    console.error('Create org error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// CREATE STRIPE CHECKOUT SESSION FOR A PENDING ORG
router.post('/:id/checkout', requireAuth, async (req, res) => {
  const orgId = parseInt(req.params.id, 10);
  if (isNaN(orgId)) {
    return res.status(400).json({ error: 'Invalid org ID' });
  }

  try {
    // Verify org exists, is pending payment, and belongs to the current user
    const orgResult = await db.query(
      `SELECT id, slug, name, status, created_by, contribution_amount_cents
       FROM orgs WHERE id = $1`,
      [orgId]
    );

    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const org = orgResult.rows[0];

    if (org.created_by !== req.session.userId) {
      return res.status(403).json({ error: 'Only the org creator can initiate payment' });
    }

    if (org.status !== 'pending_payment') {
      return res.status(400).json({ error: 'This organization does not need payment' });
    }

    if (!org.contribution_amount_cents || org.contribution_amount_cents < 50) {
      return res.status(400).json({ error: 'Invalid contribution amount' });
    }

    // Build redirect URLs
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
    const successUrl = `${baseUrl}/#/org/${org.slug}?contribution=success`;
    const cancelUrl  = `${baseUrl}/#/org/${org.slug}?contribution=canceled`;

    // Create the Stripe Checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Prema contribution — ${org.name}`,
            description: 'One-time contribution to support Prema (hosting, development, operations).',
          },
          unit_amount: org.contribution_amount_cents,
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        org_id: String(org.id),
        user_id: String(req.session.userId),
      },
    });

    // Store the Stripe session ID on the org so we can reconcile with the webhook later
    await db.query(
      `UPDATE orgs SET stripe_session_id = $1 WHERE id = $2`,
      [session.id, org.id]
    );

    res.json({ url: session.url });

  } catch (err) {
    console.error('Create checkout session error:', err.message);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
});

// ACTIVATE A PENDING ORG WITHOUT PAYMENT (canceled checkout, abandoned tab, or owner revisit)
router.post('/:id/activate-without-payment', requireAuth, async (req, res) => {
  const orgId = parseInt(req.params.id, 10);
  if (isNaN(orgId)) {
    return res.status(400).json({ error: 'Invalid org ID' });
  }

  try {
    const result = await db.query(
      `UPDATE orgs
         SET status = 'active'
       WHERE id = $1
         AND status = 'pending_payment'
         AND created_by = $2
       RETURNING id, slug, status`,
      [orgId, req.session.userId]
    );

    if (result.rows.length === 0) {
      // Either org doesn't exist, isn't yours, or isn't pending_payment — all fine, just no-op
      return res.json({ activated: false });
    }

    res.json({ activated: true, org: result.rows[0] });

  } catch (err) {
    console.error('Activate without payment error:', err.message);
    res.status(500).json({ error: 'Could not activate organization' });
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

// CREATE AN EVENT
router.post('/:id/events', requireAuth, async (req, res) => {
  const { title, description, event_date, location, capacity, type } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const membership = await db.query(
      'SELECT * FROM org_members WHERE org_id = $1 AND user_id = $2 AND role = $3 AND status = $4',
      [req.params.id, req.session.userId, 'admin', 'active']
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'Only org admins can create events' });
    }

    const result = await db.query(
      `INSERT INTO events (org_id, title, description, event_date, location, capacity, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [req.params.id, title, description, event_date, location, capacity || null, type || 'event']
    );

    res.status(201).json({ message: 'Event created', eventId: result.rows[0].id });

  } catch (err) {
    console.error('Create event error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// GET MEMBERS (org admin only)
router.get('/:id/members', requireAuth, async (req, res) => {
  try {
    const membership = await db.query(
      'SELECT * FROM org_members WHERE org_id = $1 AND user_id = $2 AND role = $3 AND status = $4',
      [req.params.id, req.session.userId, 'admin', 'active']
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'Only org admins can view the member list' });
    }

    const result = await db.query(
      `SELECT org_members.id, org_members.user_id, org_members.role, org_members.status,
              org_members.created_at, users.username, users.display_name
       FROM org_members
       JOIN users ON org_members.user_id = users.id
       WHERE org_members.org_id = $1
       ORDER BY org_members.status ASC, org_members.created_at ASC`,
      [req.params.id]
    );

    res.json({ members: result.rows });

  } catch (err) {
    console.error('Get members error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// APPROVE OR REJECT A JOIN REQUEST
router.patch('/:id/members/:userId', requireAuth, async (req, res) => {
  const { action } = req.body; // 'approve' or 'reject'

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be approve or reject' });
  }

  try {
    const membership = await db.query(
      'SELECT * FROM org_members WHERE org_id = $1 AND user_id = $2 AND role = $3 AND status = $4',
      [req.params.id, req.session.userId, 'admin', 'active']
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'Only org admins can manage members' });
    }

    if (action === 'approve') {
      await db.query(
        'UPDATE org_members SET status = $1 WHERE org_id = $2 AND user_id = $3',
        ['active', req.params.id, req.params.userId]
      );
      res.json({ message: 'Member approved' });
    } else {
      await db.query(
        'DELETE FROM org_members WHERE org_id = $1 AND user_id = $2',
        [req.params.id, req.params.userId]
      );
      res.json({ message: 'Request rejected' });
    }

  } catch (err) {
    console.error('Manage member error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// PROMOTE MEMBER TO ORG ADMIN
router.patch('/:id/members/:userId/role', requireAuth, async (req, res) => {
  try {
    const membership = await db.query(
      'SELECT * FROM org_members WHERE org_id = $1 AND user_id = $2 AND role = $3 AND status = $4',
      [req.params.id, req.session.userId, 'admin', 'active']
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'Only org admins can promote members' });
    }

    await db.query(
      'UPDATE org_members SET role = $1 WHERE org_id = $2 AND user_id = $3',
      ['admin', req.params.id, req.params.userId]
    );

    res.json({ message: 'Member promoted to org admin' });

  } catch (err) {
    console.error('Promote member error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});


module.exports = router;