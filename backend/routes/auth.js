const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db');
const crypto = require('crypto');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../email');

// Track recent resend verification requests (email -> timestamp ms)
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds between sends per email
const resendCooldowns = new Map();

// Periodically clear expired entries so the map doesn't grow forever
setInterval(() => {
  const cutoff = Date.now() - RESEND_COOLDOWN_MS;
  for (const [email, ts] of resendCooldowns) {
    if (ts < cutoff) resendCooldowns.delete(email);
  }
}, 5 * 60 * 1000);

// SIGN UP
router.post('/signup', async (req, res) => {
  const { username, email, password, display_name, location, bio, intent } = req.body;

  // Basic validation
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required' });
  }

  try {
    // Check if username or email already exists
    const existing = await db.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already taken' });
    }

    // Hash the password
    const password_hash = await bcrypt.hash(password, 12);

    // Insert the new user
    const result = await db.query(
      `INSERT INTO users 
        (username, email, password_hash, display_name, location, bio, intent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, email, display_name, location, bio, intent`,
      [username, email, password_hash, display_name, location, bio, intent]
    );

    const user = result.rows[0];

    const token = crypto.randomBytes(32).toString('hex');
const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

await db.query(
  'INSERT INTO email_verifications (user_id, token, expires_at) VALUES ($1, $2, $3)',
  [user.id, token, expires]
);

try {
  await sendVerificationEmail(email, user.username, token);
  console.log('Verification email sent to:', email);
} catch (emailErr) {
  console.error('Email send failed:', emailErr.message);
}

res.status(201).json({ 
  message: 'Account created. Please check your email to verify your account.',
  user 
});

} catch (err) {
  console.error('Signup error:', err.message);
  res.status(500).json({ error: 'Something went wrong' });
}
});

// SIGN IN
router.post('/signin', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find the user
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check if banned
    if (user.is_banned) {
      return res.status(403).json({ error: 'This account has been banned' });
    }

    if (!user.is_verified) {
  return res.status(403).json({ error: 'Please verify your email before signing in' });
}

    // Compare password
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Set session
    req.session.userId = user.id;

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        location: user.location,
        bio: user.bio,
        intent: user.intent,
        is_admin: user.is_admin
      }
    });

  } catch (err) {
    console.error('Signin error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// VERIFY EMAIL
router.get('/verify/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const result = await db.query(
      'SELECT * FROM email_verifications WHERE token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.redirect(`${process.env.BASE_URL}/index.html?verified=invalid`);
    }

    const verification = result.rows[0];

    if (new Date() > new Date(verification.expires_at)) {
      await db.query('DELETE FROM email_verifications WHERE token = $1', [token]);
      return res.redirect(`${process.env.BASE_URL}/index.html?verified=expired`);
    }

    await db.query('UPDATE users SET is_verified = TRUE WHERE id = $1', [verification.user_id]);
    await db.query('DELETE FROM email_verifications WHERE token = $1', [token]);

    res.redirect(`${process.env.BASE_URL}/index.html?verified=true`);

  } catch (err) {
    console.error('Verify error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// RESEND VERIFICATION
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const genericResponse = { message: 'If that email needs verification, a new link has been sent.' };

  // Rate limit — silently skip if we recently sent one to this email
  const lastSent = resendCooldowns.get(email);
  if (lastSent && Date.now() - lastSent < RESEND_COOLDOWN_MS) {
    return res.json(genericResponse);
  }

  try {
    const result = await db.query(
      'SELECT id, username, is_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) return res.json(genericResponse);

    const user = result.rows[0];
    if (user.is_verified) return res.json(genericResponse);

    await db.query('DELETE FROM email_verifications WHERE user_id = $1', [user.id]);

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.query(
      'INSERT INTO email_verifications (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expires]
    );

    try {
      await sendVerificationEmail(email, user.username, token);
      console.log('Resent verification email to:', email);
      resendCooldowns.set(email, Date.now()); // record after success
    } catch (emailErr) {
      console.error('Resend email failed:', emailErr.message);
    }

    return res.json(genericResponse);

  } catch (err) {
    console.error('Resend verification error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// FORGOT PASSWORD
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const user = result.rows[0];

    await db.query('DELETE FROM password_resets WHERE user_id = $1', [user.id]);

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await db.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expires]
    );

    await sendPasswordResetEmail(email, user.username, token);

    res.json({ message: 'If that email exists, a reset link has been sent.' });

  } catch (err) {
    console.error('Forgot password error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// RESET PASSWORD
router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'New password is required' });
  }

  try {
    const result = await db.query(
      'SELECT * FROM password_resets WHERE token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const reset = result.rows[0];

    if (new Date() > new Date(reset.expires_at)) {
      await db.query('DELETE FROM password_resets WHERE token = $1', [token]);
      return res.status(400).json({ error: 'Reset link has expired' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, reset.user_id]);
    await db.query('DELETE FROM password_resets WHERE token = $1', [token]);

    res.json({ message: 'Password reset successfully. You can now sign in.' });

  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// SIGN OUT
router.post('/signout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not sign out' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Signed out successfully' });
  });
});

// GET CURRENT USER
router.get('/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    const result = await db.query(
      'SELECT id, username, email, display_name, location, bio, intent, is_admin FROM users WHERE id = $1',
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });

  } catch (err) {
    console.error('Me error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

module.exports = router;