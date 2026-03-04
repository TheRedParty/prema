const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in' });
  }
  next();
}

// GET PUBLIC PROFILE
router.get('/:username', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, display_name, location, bio, intent, created_at
       FROM users
       WHERE username = $1
       AND is_banned = FALSE`,
      [req.params.username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get active posts
    const posts = await db.query(
      `SELECT id, type, scope, category, title, body, location, created_at
       FROM posts
       WHERE user_id = $1
       AND is_active = TRUE
       AND is_removed = FALSE
       ORDER BY created_at DESC`,
      [user.id]
    );

    // Get vouches received
    const vouches = await db.query(
      `SELECT vouches.*, users.display_name as voucher_name, users.username as voucher_username
       FROM vouches
       JOIN users ON vouches.voucher_id = users.id
       WHERE vouches.vouchee_id = $1
       ORDER BY vouches.created_at DESC`,
      [user.id]
    );

    // Get thank you notes (only displayed ones)
    const thankYouNotes = await db.query(
      `SELECT thank_you_notes.*, 
        CASE WHEN thank_you_notes.is_anonymous THEN 'Anonymous' 
             ELSE users.display_name 
        END as author_name
       FROM thank_you_notes
       JOIN users ON thank_you_notes.author_id = users.id
       WHERE thank_you_notes.recipient_id = $1
       AND thank_you_notes.is_displayed = TRUE
       AND thank_you_notes.is_removed = FALSE
       ORDER BY thank_you_notes.created_at DESC`,
      [user.id]
    );

    // Get completed helps count
    const completions = await db.query(
      `SELECT COUNT(*) FROM completions
       JOIN threads ON completions.thread_id = threads.id
       WHERE threads.participant_a = $1 OR threads.participant_b = $1`,
      [user.id]
    );

    res.json({
      user,
      posts: posts.rows,
      vouches: vouches.rows,
      thankYouNotes: thankYouNotes.rows,
      completedHelps: parseInt(completions.rows[0].count)
    });

  } catch (err) {
    console.error('Get profile error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// UPDATE OWN PROFILE
router.patch('/me', requireAuth, async (req, res) => {
  const { display_name, location, bio } = req.body;

  try {
    const result = await db.query(
      `UPDATE users 
       SET display_name = COALESCE($1, display_name),
           location = COALESCE($2, location),
           bio = COALESCE($3, bio)
       WHERE id = $4
       RETURNING id, username, email, display_name, location, bio, intent`,
      [display_name, location, bio, req.session.userId]
    );

    res.json({ user: result.rows[0] });

  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// REPORT A USER
router.post('/:username/report', requireAuth, async (req, res) => {
  const { reason, other_text } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'A reason is required' });
  }

  try {
    const result = await db.query(
      'SELECT id FROM users WHERE username = $1',
      [req.params.username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.query(
      `INSERT INTO reports (reporter_id, content_type, content_id, reason, other_text)
       VALUES ($1, 'profile', $2, $3, $4)`,
      [req.session.userId, result.rows[0].id, reason, other_text]
    );

    res.json({ message: 'Report submitted' });

  } catch (err) {
    console.error('Report user error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;