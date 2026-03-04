const express = require('express');
const router = express.Router();
const db = require('../db');

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in' });
  }
  next();
}

// GET ALL THREADS FOR CURRENT USER
router.get('/threads', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT threads.*,
        ua.username as user_a_username, ua.display_name as user_a_name,
        ub.username as user_b_username, ub.display_name as user_b_name,
        posts.title as post_title,
        (SELECT body FROM messages WHERE messages.thread_id = threads.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE messages.thread_id = threads.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM messages WHERE messages.thread_id = threads.id AND messages.is_read = FALSE AND messages.sender_id != $1) as unread_count
       FROM threads
       JOIN users ua ON threads.participant_a = ua.id
       JOIN users ub ON threads.participant_b = ub.id
       LEFT JOIN posts ON threads.post_id = posts.id
       WHERE threads.participant_a = $1 OR threads.participant_b = $1
       ORDER BY last_message_at DESC NULLS LAST`,
      [req.session.userId]
    );

    res.json({ threads: result.rows });

  } catch (err) {
    console.error('Get threads error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// START OR GET A THREAD
router.post('/threads', requireAuth, async (req, res) => {
  const { recipient_id, post_id } = req.body;

  if (!recipient_id) {
    return res.status(400).json({ error: 'Recipient is required' });
  }

  if (recipient_id === req.session.userId) {
    return res.status(400).json({ error: 'You cannot message yourself' });
  }

  try {
    // Check if thread already exists between these two users about this post
    const existing = await db.query(
      `SELECT * FROM threads 
       WHERE ((participant_a = $1 AND participant_b = $2) 
          OR (participant_a = $2 AND participant_b = $1))
       AND (post_id = $3 OR ($3::integer IS NULL AND post_id IS NULL))`,
      [req.session.userId, recipient_id, post_id || null]
    );

    if (existing.rows.length > 0) {
      return res.json({ thread: existing.rows[0] });
    }

    // Create new thread
    const result = await db.query(
      `INSERT INTO threads (participant_a, participant_b, post_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.session.userId, recipient_id, post_id || null]
    );

    res.status(201).json({ thread: result.rows[0] });

  } catch (err) {
    console.error('Create thread error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// GET MESSAGES IN A THREAD
router.get('/threads/:id', requireAuth, async (req, res) => {
  try {
   const thread = await db.query(
  `SELECT threads.*,
    ua.username as user_a_username, ua.display_name as user_a_name,
    ub.username as user_b_username, ub.display_name as user_b_name,
    posts.title as post_title
   FROM threads
   JOIN users ua ON threads.participant_a = ua.id
   JOIN users ub ON threads.participant_b = ub.id
   LEFT JOIN posts ON threads.post_id = posts.id
   WHERE threads.id = $1`,
  [req.params.id]
);

    if (thread.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const t = thread.rows[0];

    // Make sure the user is a participant
    if (t.participant_a !== req.session.userId && t.participant_b !== req.session.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get messages
    const messages = await db.query(
      `SELECT messages.*, users.display_name, users.username
       FROM messages
       JOIN users ON messages.sender_id = users.id
       WHERE messages.thread_id = $1
       ORDER BY messages.created_at ASC`,
      [req.params.id]
    );

    // Mark messages as read
    await db.query(
      `UPDATE messages SET is_read = TRUE 
       WHERE thread_id = $1 AND sender_id != $2`,
      [req.params.id, req.session.userId]
    );

    res.json({ thread: t, messages: messages.rows });

  } catch (err) {
    console.error('Get messages error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// SEND A MESSAGE
router.post('/threads/:id/messages', requireAuth, async (req, res) => {
  const { body } = req.body;

  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  try {
    const thread = await db.query(
      'SELECT * FROM threads WHERE id = $1',
      [req.params.id]
    );

    if (thread.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const t = thread.rows[0];

    if (t.participant_a !== req.session.userId && t.participant_b !== req.session.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await db.query(
      `INSERT INTO messages (thread_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.params.id, req.session.userId, body.trim()]
    );

    res.status(201).json({ message: result.rows[0] });

  } catch (err) {
    console.error('Send message error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// MARK THREAD AS COMPLETE
router.post('/threads/:id/complete', requireAuth, async (req, res) => {
  try {
    const thread = await db.query(
      'SELECT * FROM threads WHERE id = $1',
      [req.params.id]
    );

    if (thread.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const t = thread.rows[0];

    if (t.participant_a !== req.session.userId && t.participant_b !== req.session.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db.query(
      'UPDATE threads SET status = $1 WHERE id = $2',
      ['complete', req.params.id]
    );

    await db.query(
      'INSERT INTO completions (thread_id, confirmed_by) VALUES ($1, $2)',
      [req.params.id, req.session.userId]
    );

    res.json({ message: 'Thread marked as complete' });

  } catch (err) {
    console.error('Complete thread error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// LEAVE A THANK YOU NOTE
router.post('/threads/:id/thank-you', requireAuth, async (req, res) => {
  const { body, is_anonymous } = req.body;

  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'Note cannot be empty' });
  }

  try {
    const thread = await db.query(
      'SELECT * FROM threads WHERE id = $1',
      [req.params.id]
    );

    if (thread.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const t = thread.rows[0];

    if (t.participant_a !== req.session.userId && t.participant_b !== req.session.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const recipient_id = t.participant_a === req.session.userId 
      ? t.participant_b 
      : t.participant_a;

    await db.query(
      `INSERT INTO thank_you_notes (thread_id, author_id, recipient_id, body, is_anonymous)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, req.session.userId, recipient_id, body.trim(), is_anonymous || false]
    );

    res.status(201).json({ message: 'Thank you note sent' });

  } catch (err) {
    console.error('Thank you note error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// VOUCH FOR SOMEONE
router.post('/threads/:id/vouch', requireAuth, async (req, res) => {
  const { note } = req.body;

  try {
    const thread = await db.query(
      'SELECT * FROM threads WHERE id = $1',
      [req.params.id]
    );

    if (thread.rows.length === 0) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const t = thread.rows[0];

    if (t.status !== 'complete') {
      return res.status(400).json({ error: 'Can only vouch after a completed interaction' });
    }

    if (t.participant_a !== req.session.userId && t.participant_b !== req.session.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const vouchee_id = t.participant_a === req.session.userId 
      ? t.participant_b 
      : t.participant_a;

    await db.query(
      `INSERT INTO vouches (thread_id, voucher_id, vouchee_id, note)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, req.session.userId, vouchee_id, note || null]
    );

    res.status(201).json({ message: 'Vouch recorded' });

  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'You have already vouched for this interaction' });
    }
    console.error('Vouch error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;