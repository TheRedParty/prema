const express = require("express");
const router = express.Router();
const db = require("../db");

// Middleware to check if logged in
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "You must be logged in" });
  }
  next();
}

// GET ALL POSTS
router.get("/", async (req, res) => {
  const { scope, category, type, q, org_id, event_id } = req.query;

  try {
    let query = `
      SELECT posts.*, users.username, users.display_name, users.location as user_location,
             claimer.display_name as claimer_name, claimer.username as claimer_username
      FROM posts
      JOIN users ON posts.user_id = users.id
      LEFT JOIN users claimer ON posts.claimed_by = claimer.id
      WHERE posts.is_active = TRUE
      AND posts.is_removed = FALSE
      AND users.is_banned = FALSE
    `;

    const params = [];
    let paramCount = 1;

    // Org-scoped vs. general feed
    if (org_id) {
      query += ` AND posts.org_id = $${paramCount}`;
      params.push(org_id);
      paramCount++;

      if (event_id) {
        query += ` AND posts.event_id = $${paramCount}`;
        params.push(event_id);
        paramCount++;
      }
    } else {
      // Default: main board excludes org-scoped posts
      query += ` AND posts.org_id IS NULL`;
    }

    if (scope) {
      query += ` AND posts.scope = $${paramCount}`;
      params.push(scope);
      paramCount++;
    }

    if (category && category !== "all") {
      query += ` AND posts.category = $${paramCount}`;
      params.push(category);
      paramCount++;
    }

    if (type && type !== "all") {
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
    console.error("Get posts error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// CREATE A POST
router.post("/", requireAuth, async (req, res) => {
  const {
    type,
    scope,
    category,
    title,
    body,
    location,
    latitude,
    longitude,
    org_id,
    event_id,
    members_only,
  } = req.body;

  if (!type || !scope || !category || !title || !body) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // If this is an org post, validate membership and event ownership
    if (org_id) {
      // User must be an active member of the org
      const membership = await db.query(
        `SELECT role, status FROM org_members
         WHERE org_id = $1 AND user_id = $2`,
        [org_id, req.session.userId],
      );

      if (
        membership.rows.length === 0 ||
        membership.rows[0].status !== "active"
      ) {
        return res
          .status(403)
          .json({ error: "You must be an active member of this org to post" });
      }

      // If an event is specified, it must belong to this org
      if (event_id) {
        const event = await db.query(
          `SELECT org_id FROM events WHERE id = $1`,
          [event_id],
        );

        if (event.rows.length === 0) {
          return res.status(404).json({ error: "Event not found" });
        }

        if (event.rows[0].org_id !== Number(org_id)) {
          return res
            .status(400)
            .json({ error: "Event does not belong to this org" });
        }
      }
    }

    // members_only only matters for org posts; force false for general board posts
    const finalMembersOnly = org_id ? members_only !== false : false;

    const result = await db.query(
      `INSERT INTO posts (
         user_id, type, scope, category, title, body, location,
         latitude, longitude, org_id, event_id, members_only
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        req.session.userId,
        type,
        scope,
        category,
        title,
        body,
        location,
        latitude || null,
        longitude || null,
        org_id || null,
        event_id || null,
        finalMembersOnly,
      ],
    );

    res.status(201).json({ post: result.rows[0] });
  } catch (err) {
    console.error("Create post error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// GET SINGLE POST
router.get("/:id", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT posts.*, users.username, users.display_name, users.location as user_location
       FROM posts
       JOIN users ON posts.user_id = users.id
       WHERE posts.id = $1
       AND posts.is_removed = FALSE`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    res.json({ post: result.rows[0] });
  } catch (err) {
    console.error("Get post error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// DELETE A POST
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM posts WHERE id = $1", [
      req.params.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = result.rows[0];

    if (post.user_id !== req.session.userId) {
      return res
        .status(403)
        .json({ error: "You can only delete your own posts" });
    }

    await db.query("UPDATE posts SET is_active = FALSE WHERE id = $1", [
      req.params.id,
    ]);

    res.json({ message: "Post deleted" });
  } catch (err) {
    console.error("Delete post error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// REPORT A POST
router.post("/:id/report", requireAuth, async (req, res) => {
  const { reason, other_text } = req.body;

  if (!reason) {
    return res.status(400).json({ error: "A reason is required" });
  }

  try {
    await db.query(
      `INSERT INTO reports (reporter_id, content_type, content_id, reason, other_text)
       VALUES ($1, 'post', $2, $3, $4)`,
      [req.session.userId, req.params.id, reason, other_text],
    );

    // Increment report count
    await db.query(
      "UPDATE posts SET report_count = report_count + 1 WHERE id = $1",
      [req.params.id],
    );

    // Auto-remove at 5 reports
    await db.query(
      "UPDATE posts SET is_removed = TRUE WHERE id = $1 AND report_count >= 5",
      [req.params.id],
    );

    res.json({ message: "Report submitted" });
  } catch (err) {
    console.error("Report error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// CLAIM A POST
router.post("/:id/claim", requireAuth, async (req, res) => {
  try {
    const postResult = await db.query(
      `SELECT * FROM posts WHERE id = $1`,
      [req.params.id],
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = postResult.rows[0];

    if (!post.is_active || post.is_removed) {
      return res.status(400).json({ error: "This post is no longer active" });
    }

    if (post.type !== "need") {
      return res.status(400).json({ error: "Only needs can be claimed" });
    }

    if (post.claimed_by) {
      return res.status(400).json({ error: "Already claimed by someone else" });
    }

    if (post.fulfilled_at) {
      return res.status(400).json({ error: "Already fulfilled" });
    }

    if (post.user_id === req.session.userId) {
      return res.status(400).json({ error: "You can't claim your own post" });
    }

    // Membership gate for private org posts
    if (post.members_only && post.org_id) {
      const membership = await db.query(
        `SELECT status FROM org_members
         WHERE org_id = $1 AND user_id = $2`,
        [post.org_id, req.session.userId],
      );

      if (
        membership.rows.length === 0 ||
        membership.rows[0].status !== "active"
      ) {
        return res.status(403).json({
          error: "This post is only visible to members of the org",
        });
      }
    }

    // Mark the post as claimed
    await db.query(
      `UPDATE posts SET claimed_by = $1, claimed_at = NOW() WHERE id = $2`,
      [req.session.userId, post.id],
    );

    // Create or find a thread between the two users for this post
    const a = Math.min(post.user_id, req.session.userId);
    const b = Math.max(post.user_id, req.session.userId);

    let thread = await db.query(
      `SELECT id FROM threads
       WHERE post_id = $1 AND participant_a = $2 AND participant_b = $3`,
      [post.id, a, b],
    );

    let threadId;
    if (thread.rows.length === 0) {
      const newThread = await db.query(
        `INSERT INTO threads (participant_a, participant_b, post_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [a, b, post.id],
      );
      threadId = newThread.rows[0].id;
    } else {
      threadId = thread.rows[0].id;
    }

    res.json({ message: "Claimed", thread_id: threadId });
  } catch (err) {
    console.error("Claim error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// UNCLAIM A POST
router.delete("/:id/claim", requireAuth, async (req, res) => {
  try {
    const postResult = await db.query(
      `SELECT claimed_by FROM posts WHERE id = $1`,
      [req.params.id],
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (postResult.rows[0].claimed_by !== req.session.userId) {
      return res
        .status(403)
        .json({ error: "Only the claimer can unclaim" });
    }

    await db.query(
      `UPDATE posts SET claimed_by = NULL, claimed_at = NULL WHERE id = $1`,
      [req.params.id],
    );

    res.json({ message: "Unclaimed" });
  } catch (err) {
    console.error("Unclaim error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// FULFILL A POST
router.post("/:id/fulfill", requireAuth, async (req, res) => {
  try {
    const postResult = await db.query(
      `SELECT user_id, org_id, fulfilled_at FROM posts WHERE id = $1`,
      [req.params.id],
    );

    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = postResult.rows[0];

    if (post.fulfilled_at) {
      return res.status(400).json({ error: "Already fulfilled" });
    }

    // Allowed: post owner, OR an admin of the org the post belongs to
    let allowed = post.user_id === req.session.userId;

    if (!allowed && post.org_id) {
      const membership = await db.query(
        `SELECT role, status FROM org_members
         WHERE org_id = $1 AND user_id = $2`,
        [post.org_id, req.session.userId],
      );

      allowed =
        membership.rows.length > 0 &&
        membership.rows[0].status === "active" &&
        membership.rows[0].role === "admin";
    }

    if (!allowed) {
      return res
        .status(403)
        .json({ error: "Not authorized to fulfill this post" });
    }

    await db.query(
      `UPDATE posts SET fulfilled_at = NOW() WHERE id = $1`,
      [req.params.id],
    );

    res.json({ message: "Fulfilled" });
  } catch (err) {
    console.error("Fulfill error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;
