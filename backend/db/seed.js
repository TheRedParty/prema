// backend/db/seed.js
// Run with: node db/seed.js
// Wipes existing data and creates a consistent local dev dataset.

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

async function seed() {
  try {
    console.log("Wiping existing data...");

    // Order matters — delete child rows before parents
    await db.query("DELETE FROM event_rsvps");
    await db.query("DELETE FROM events");
    await db.query("DELETE FROM org_announcements");
    await db.query("DELETE FROM org_members");
    await db.query("DELETE FROM org_creation_requests");
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
      "org_creation_requests", "reports", "completions",
      "thank_you_notes", "vouches", "email_verifications",
      "password_resets",
    ];
    for (const t of tables) {
      await db.query(`ALTER SEQUENCE ${t}_id_seq RESTART WITH 1`);
    }

    console.log("Creating users...");

    const scarlett = await db.query(
      `INSERT INTO users (username, email, password_hash, display_name, location, bio, is_verified, is_admin)
       VALUES ('thescarlettrebel', 'thescarlettrebel@proton.me', $1, 'Scarlett', 'Fairfax, VA', 'Admin and organizer.', TRUE, TRUE)
       RETURNING id`,
      [PASSWORD_HASH],
    );

    const alex = await db.query(
      `INSERT INTO users (username, email, password_hash, display_name, location, bio, is_verified)
       VALUES ('alexm', 'alex@example.com', $1, 'Alex M.', 'Fairfax, VA', 'Neighbor helping out.', TRUE)
       RETURNING id`,
      [PASSWORD_HASH],
    );

    const jordan = await db.query(
      `INSERT INTO users (username, email, password_hash, display_name, location, bio, is_verified)
       VALUES ('jordank', 'jordan@example.com', $1, 'Jordan K.', 'Arlington, VA', 'New to the area.', TRUE)
       RETURNING id`,
      [PASSWORD_HASH],
    );

    console.log("Creating org...");

    const org = await db.query(
      `INSERT INTO orgs (name, slug, description, category, scope, location, status, created_by)
       VALUES ('Fairfax Mutual Aid', 'fairfax-mutual-aid',
               'Local mutual aid network for Fairfax and surrounding areas.',
               'Mutual Aid', 'local', 'Fairfax, VA', 'approved', $1)
       RETURNING id`,
      [scarlett.rows[0].id],
    );

    console.log("Adding org members...");

    // Scarlett as org admin
    await db.query(
      `INSERT INTO org_members (org_id, user_id, role, status)
       VALUES ($1, $2, 'admin', 'active')`,
      [org.rows[0].id, scarlett.rows[0].id],
    );

    // Alex as active member
    await db.query(
      `INSERT INTO org_members (org_id, user_id, role, status)
       VALUES ($1, $2, 'member', 'active')`,
      [org.rows[0].id, alex.rows[0].id],
    );

    // Jordan as a PENDING member — for testing the approval flow
    await db.query(
      `INSERT INTO org_members (org_id, user_id, role, status)
       VALUES ($1, $2, 'member', 'pending')`,
      [org.rows[0].id, jordan.rows[0].id],
    );

    console.log("Creating a sample event...");

    await db.query(
      `INSERT INTO events (org_id, title, description, event_date, event_time, location, capacity)
       VALUES ($1, 'ecobeats 2026', 'Annual community festival.',
               'May 15, 2026', '12:00 PM', 'Fairfax City Park', 200)`,
      [org.rows[0].id],
    );

    console.log("Creating a sample general board post...");

    await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body, location)
       VALUES ($1, 'ability', 'local', 'transport',
               'Can offer rides to the grocery store',
               'I have a car and free Tuesday afternoons. Fairfax area.',
               'Fairfax, VA')`,
      [alex.rows[0].id],
    );

    console.log("Creating sample org posts...");

    // Need to grab the event we just created
    const event = await db.query(
      `SELECT id FROM events WHERE org_id = $1 LIMIT 1`,
      [org.rows[0].id],
    );
    const eventId = event.rows[0].id;

    // General org need (no event)
    await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body, org_id, members_only)
       VALUES ($1, 'need', 'local', 'other',
               'Printer paper + toner for office',
               'We go through a lot during outreach months. Any donations help.',
               $2, TRUE)`,
      [scarlett.rows[0].id, org.rows[0].id],
    );

    // Event-linked need
    await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body, org_id, event_id, members_only)
       VALUES ($1, 'need', 'local', 'other',
               'Generator for the ecobeats stage',
               'We need a quiet generator capable of running the PA for 6 hours.',
               $2, $3, FALSE)`,
      [scarlett.rows[0].id, org.rows[0].id, eventId],
    );

    // Event-linked ability
    await db.query(
      `INSERT INTO posts (user_id, type, scope, category, title, body, org_id, event_id, members_only)
       VALUES ($1, 'ability', 'local', 'other',
               'I can bring tents + folding tables',
               'I have 4 canopy tents and 6 folding tables from previous events.',
               $2, $3, TRUE)`,
      [alex.rows[0].id, org.rows[0].id, eventId],
    );

    console.log("");
    console.log("Done! You can sign in as any of these:");
    console.log("  thescarlettrebel / testpass123  (platform admin, org admin)");
    console.log("  alexm            / testpass123  (approved org member)");
    console.log("  jordank          / testpass123  (pending org member)");

    process.exit(0);
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
}

seed();