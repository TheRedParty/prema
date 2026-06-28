// backend/db/seed.js
// Run with: node db/seed.js
// Wipes existing data and creates a consistent local dev dataset,
// including completed threads, thank you notes, and vouches so the
// new completion/note/vouch flows can be tested in every state.

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const db = require("../db");

// Safety guard — never wipe a non-dev database.
if (process.env.DB_NAME !== "prema_dev") {
  console.error(
    `Seed script refuses to run on database "${process.env.DB_NAME}". ` +
    `Expected "prema_dev". Aborting.`,
  );
  process.exit(1);
}

const PASSWORD_HASH =
  "$2b$12$gvV6AN1ARV.bxhEH19Hu2OSesYUVWYC8ktYVtS065Txi6qj3PO1KG"; // password: testpass123

/* ─── small helpers, to keep the "world" section readable ───────────── */

// Create a thread, add its messages, optionally mark it complete.
// messages: [{ from: userId, body: "..." }]
async function makeThread({ a, b, postId = null, status = "active", messages = [], completedBy = null }) {
  const thread = await db.query(
    `INSERT INTO threads (participant_a, participant_b, post_id, status)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [a, b, postId, status],
  );
  const threadId = thread.rows[0].id;

  for (const m of messages) {
    await db.query(
      `INSERT INTO messages (thread_id, sender_id, body) VALUES ($1, $2, $3)`,
      [threadId, m.from, m.body],
    );
  }

  if (completedBy) {
    await db.query(
      `INSERT INTO completions (thread_id, confirmed_by) VALUES ($1, $2)`,
      [threadId, completedBy],
    );
  }

  return threadId;
}

// A thank you note (always inserted visible, matching the new default).
async function makeNote({ threadId, author, recipient, body, anon = false }) {
  await db.query(
    `INSERT INTO thank_you_notes (thread_id, author_id, recipient_id, body, is_anonymous, is_displayed)
     VALUES ($1, $2, $3, $4, $5, TRUE)`,
    [threadId, author, recipient, body, anon],
  );
}

// A person-vouch (no thread, no note — the new shape).
async function makeVouch({ voucher, vouchee }) {
  await db.query(
    `INSERT INTO vouches (voucher_id, vouchee_id) VALUES ($1, $2)`,
    [voucher, vouchee],
  );
}

async function seed() {
  try {
    console.log("Wiping existing data...");

    // Order matters — delete child rows before parents
    await db.query("DELETE FROM event_rsvps");
    await db.query("DELETE FROM events");
    await db.query("DELETE FROM org_announcements");
    await db.query("DELETE FROM org_members");
    await db.query("DELETE FROM orgs");
    await db.query("DELETE FROM thank_you_notes");
    await db.query("DELETE FROM vouches");
    await db.query("DELETE FROM completions");
    await db.query("DELETE FROM messages");
    await db.query("DELETE FROM threads");
    await db.query("DELETE FROM reports");
    await db.query("DELETE FROM posts");
    await db.query("DELETE FROM email_verifications");
    await db.query("DELETE FROM password_resets");
    await db.query("DELETE FROM sessions");
    await db.query("DELETE FROM users");

    // Reset sequences so IDs start at 1 again
    const tables = [
      "users", "orgs", "posts", "threads", "messages", "events",
      "event_rsvps", "org_members", "org_announcements",
      "reports", "completions",
      "thank_you_notes", "vouches", "email_verifications",
      "password_resets",
    ];
    for (const t of tables) {
      await db.query(`ALTER SEQUENCE ${t}_id_seq RESTART WITH 1`);
    }

    /* ─── USERS ──────────────────────────────────────────────────── */
    console.log("Creating users...");

    const sId = (await db.query(
      `INSERT INTO users (username, email, password_hash, display_name, location, bio, is_verified, is_admin)
       VALUES ('thescarlettrebel', 'thescarlettrebel@proton.me', $1, 'Scarlett', 'Fairfax, VA', 'Admin and organizer.', TRUE, TRUE)
       RETURNING id`,
      [PASSWORD_HASH],
    )).rows[0].id;

    const aId = (await db.query(
      `INSERT INTO users (username, email, password_hash, display_name, location, bio, is_verified)
       VALUES ('alexm', 'alex@example.com', $1, 'Alex M.', 'Fairfax, VA', 'Neighbor helping out. Always got a truck and a free afternoon.', TRUE)
       RETURNING id`,
      [PASSWORD_HASH],
    )).rows[0].id;

    const jId = (await db.query(
      `INSERT INTO users (username, email, password_hash, display_name, location, bio, is_verified)
       VALUES ('jordank', 'jordan@example.com', $1, 'Jordan K.', 'Arlington, VA', 'New to the area, trying to plug in.', TRUE)
       RETURNING id`,
      [PASSWORD_HASH],
    )).rows[0].id;

    const samId = (await db.query(
      `INSERT INTO users (username, email, password_hash, display_name, location, bio, is_verified)
       VALUES ('samp', 'sam@example.com', $1, 'Sam P.', 'Remote', 'Software dev. Happy to help with code, sites, anything technical.', TRUE)
       RETURNING id`,
      [PASSWORD_HASH],
    )).rows[0].id;

    const riId = (await db.query(
      `INSERT INTO users (username, email, password_hash, display_name, location, bio, is_verified)
       VALUES ('rileyd', 'riley@example.com', $1, 'Riley D.', 'Remote', 'Writer and career-changer. Learning to give as much as I get.', TRUE)
       RETURNING id`,
      [PASSWORD_HASH],
    )).rows[0].id;

    /* ─── ORG ────────────────────────────────────────────────────── */
    console.log("Creating org...");

    const orgId = (await db.query(
      `INSERT INTO orgs (name, slug, description, category, scope, location, status, created_by)
       VALUES ('Fairfax Mutual Aid', 'fairfax-mutual-aid',
               'Local mutual aid network for Fairfax and surrounding areas.',
               'Mutual Aid', 'local', 'Fairfax, VA', 'active', $1)
       RETURNING id`,
      [sId],
    )).rows[0].id;

    console.log("Adding org members...");

    await db.query(
      `INSERT INTO org_members (org_id, user_id, role, status)
       VALUES ($1, $2, 'admin', 'active')`,
      [orgId, sId],
    );
    await db.query(
      `INSERT INTO org_members (org_id, user_id, role, status)
       VALUES ($1, $2, 'member', 'active')`,
      [orgId, aId],
    );
    // Jordan PENDING — for testing the approval flow
    await db.query(
      `INSERT INTO org_members (org_id, user_id, role, status)
       VALUES ($1, $2, 'member', 'pending')`,
      [orgId, jId],
    );

    console.log("Creating a sample event...");

    const eventId = (await db.query(
      `INSERT INTO events (org_id, title, description, event_date, event_time, location, capacity)
       VALUES ($1, 'ecobeats 2026', 'Annual community festival.',
               'September 12, 2026', '12:00 PM', 'Fairfax City Park', 200)
       RETURNING id`,
      [orgId],
    )).rows[0].id;

    /* ─── GENERAL BOARD POSTS ────────────────────────────────────── */
    console.log("Creating board posts...");

    const alexRidePost = (await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body, location)
       VALUES ($1, 'ability', 'local', 'transport',
               'Can offer rides to the grocery store',
               'I have a car and free Tuesday afternoons. Fairfax area.',
               'Fairfax, VA')
       RETURNING id`,
      [aId],
    )).rows[0].id;

    await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body, location)
       VALUES ($1, 'need', 'local', 'food',
               'Could use a hand with a grocery run this week',
               'Recovering from surgery and cannot drive for a bit. Arlington.',
               'Arlington, VA')`,
      [jId],
    );

    const samDebugPost = (await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body)
       VALUES ($1, 'ability', 'global', 'tech',
               'I can help debug your React or Node project',
               'A few years of full-stack experience. Glad to pair for an hour.')
       RETURNING id`,
      [samId],
    )).rows[0].id;

    await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body)
       VALUES ($1, 'need', 'global', 'advice',
               'Resume feedback for a career switch',
               'Moving from food service into tech writing. Would love a second pair of eyes.')`,
      [riId],
    );

    const scarlettEditPost = (await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body)
       VALUES ($1, 'ability', 'global', 'writing',
               'Free copyediting for mutual aid orgs',
               'Newsletters, zines, flyers — send it over and I will clean it up.')
       RETURNING id`,
      [sId],
    )).rows[0].id;

    await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body, location)
       VALUES ($1, 'need', 'local', 'housing',
               'Looking for a few moving boxes',
               'Moving across town next weekend, any spare boxes appreciated.',
               'Fairfax, VA')`,
      [aId],
    );

    /* ─── ORG POSTS ──────────────────────────────────────────────── */
    console.log("Creating org posts...");

    await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body, org_id, members_only)
       VALUES ($1, 'need', 'local', 'other',
               'Printer paper + toner for office',
               'We go through a lot during outreach months. Any donations help.',
               $2, TRUE)`,
      [sId, orgId],
    );
    await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body, org_id, event_id, members_only)
       VALUES ($1, 'need', 'local', 'other',
               'Generator for the ecobeats stage',
               'We need a quiet generator capable of running the PA for 6 hours.',
               $2, $3, FALSE)`,
      [sId, orgId, eventId],
    );
    await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body, org_id, event_id, members_only)
       VALUES ($1, 'ability', 'local', 'other',
               'I can bring tents + folding tables',
               'I have 4 canopy tents and 6 folding tables from previous events.',
               $2, $3, TRUE)`,
      [aId, orgId, eventId],
    );

    /* ─── THE TEST WORLD: threads, notes, vouches ────────────────── */
    console.log("Building threads, notes, and vouches...");

    // T1 — COMPLETE, tied to Alex's ride post. No note yet, no vouch yet.
    // Use: sign in as jordank → leave a fresh note (Re: rides) + vouch Alex.
    await makeThread({
      a: aId, b: jId, postId: alexRidePost, status: "complete", completedBy: jId,
      messages: [
        { from: jId, body: "Hey! Saw your post — could really use a ride Tuesday if it still stands." },
        { from: aId, body: "Of course, happy to. I'll swing by around 2?" },
        { from: jId, body: "Perfect, thank you so much c:" },
      ],
    });

    // T2 — COMPLETE, tied to Sam's debug post. Riley already noted + vouched Sam.
    // Use: view samp's profile (note shows w/ Re: label + Riley's vouch);
    //      sign in as rileyd → opening this thread shows note button disabled.
    const t2 = await makeThread({
      a: samId, b: riId, postId: samDebugPost, status: "complete", completedBy: riId,
      messages: [
        { from: riId, body: "My login flow is totally broken and I'm losing my mind." },
        { from: samId, body: "Send me the repo, let's hop on a call." },
        { from: riId, body: "You're a lifesaver, it works!!" },
      ],
    });
    await makeNote({
      threadId: t2, author: riId, recipient: samId,
      body: "Sam untangled my whole auth flow in one evening and explained every step so I actually learned something. Endlessly patient.",
    });
    await makeVouch({ voucher: riId, vouchee: samId });

    // T3 — COMPLETE, tied to Scarlett's copyediting post.
    // Alex left an ANONYMOUS note for Scarlett; Scarlett & Alex vouched each other.
    // Use: view thescarlettrebel's profile → anonymous note;
    //      scarlett viewing Alex (and vice versa) → "✓ You vouched" state.
    const t3 = await makeThread({
      a: sId, b: aId, postId: scarlettEditPost, status: "complete", completedBy: sId,
      messages: [
        { from: aId, body: "Could you look over our zine before it goes to print?" },
        { from: sId, body: "Send it! I'll have notes back tonight." },
        { from: aId, body: "It reads so much better now. Thank you." },
      ],
    });
    await makeNote({
      threadId: t3, author: aId, recipient: sId, anon: true,
      body: "Edited our whole zine for free and never made me feel dumb about the typos. We couldn't have shipped without it.",
    });
    await makeVouch({ voucher: sId, vouchee: aId });
    await makeVouch({ voucher: aId, vouchee: sId });

    // T4 — COMPLETE, DIRECT MESSAGE (no post). Tests note-refusal on DMs.
    // Use: sign in as thescarlettrebel → open this thread → NO note button.
    await makeThread({
      a: sId, b: jId, postId: null, status: "complete", completedBy: sId,
      messages: [
        { from: sId, body: "Welcome to the area! Let me know if you need anything getting settled." },
        { from: jId, body: "Means a lot, thank you. Might take you up on that." },
      ],
    });

    // T5 — ACTIVE (not complete), tied to Sam's debug post, Jordan <-> Sam.
    // Use: sign in as jordank → open this thread → full Mark Fulfilled → note flow from scratch.
    await makeThread({
      a: jId, b: samId, postId: samDebugPost, status: "active",
      messages: [
        { from: jId, body: "Saw you offer debugging help — I've got a gnarly Node bug if you're around?" },
        { from: samId, body: "Yeah! Tell me what it's doing." },
      ],
    });

    /* ─── SUMMARY ────────────────────────────────────────────────── */
    console.log("");
    console.log("Done! Sign in with any account — password: testpass123");
    console.log("  thescarlettrebel  (platform + org admin)");
    console.log("  alexm  /  jordank  /  samp  /  rileyd");
    console.log("");
    console.log("Ready-made states to test:");
    console.log("  • Leave a note fresh   → jordank, completed thread w/ Alex (Re: rides)");
    console.log("  • Note button disabled → rileyd, completed thread w/ Sam (already noted)");
    console.log("  • Note shows on profile→ view samp (Riley's note, Re: label)");
    console.log("  • Anonymous note       → view thescarlettrebel (— Anonymous)");
    console.log("  • Note refused on DM   → thescarlettrebel, the direct-message thread w/ Jordan");
    console.log("  • Vouch (eligible)     → jordank viewing Alex's profile");
    console.log("  • Vouch (already done) → rileyd viewing Sam's profile (✓ You vouched)");
    console.log("  • Vouch (ineligible)   → jordank viewing Sam's profile (no completed thread)");
    console.log("  • Mark Fulfilled flow  → jordank, the ACTIVE thread w/ Sam");

    process.exit(0);
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
}

seed();
