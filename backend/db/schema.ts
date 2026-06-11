// backend/db/schema.js
// Drizzle schema for Prema. This is the source of truth for DB structure going forward.
// Edit this file, then run `npx drizzle-kit generate` to create a migration.

const {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  numeric,
  unique,
} = require('drizzle-orm/pg-core');

/* ─── USERS ─────────────────────────────────────────────── */
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 100 }),
  location: varchar('location', { length: 100 }),
  bio: text('bio'),
  intent: varchar('intent', { length: 20 }),
  isVerified: boolean('is_verified').default(false),
  isAdmin: boolean('is_admin').default(false),
  isBanned: boolean('is_banned').default(false),
  banReason: text('ban_reason'),
  createdAt: timestamp('created_at').defaultNow(),
  avatarUrl: text('avatar_url'),
});

/* ─── ORGS ──────────────────────────────────────────────── */
const orgs = pgTable('orgs', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  description: text('description'),
  category: varchar('category', { length: 100 }),
  scope: varchar('scope', { length: 10 }).notNull(),
  location: varchar('location', { length: 100 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  website: varchar('website', { length: 255 }),
  valuesStatement: text('values_statement'),
  status: varchar('status', { length: 20 }).default('active'),
  createdBy: integer('created_by').references(() => users.id),
  isRemoved: boolean('is_removed').default(false),
  reportCount: integer('report_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  avatarUrl: text('avatar_url'),
  contributionAmountCents: integer('contribution_amount_cents'),
  stripeSessionId: text('stripe_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  paidAt: timestamp('paid_at'),
});

/* ─── POSTS ─────────────────────────────────────────────── */
const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  type: varchar('type', { length: 10 }).notNull(),
  scope: varchar('scope', { length: 10 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  location: varchar('location', { length: 100 }),
  isActive: boolean('is_active').default(true),
  isRemoved: boolean('is_removed').default(false),
  reportCount: integer('report_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
  // ─── NEW: org posts ─────────────────────────────
  orgId: integer('org_id').references(() => orgs.id, { onDelete: 'cascade' }),
  eventId: integer('event_id').references(() => events.id, { onDelete: 'set null' }),
  membersOnly: boolean('members_only').notNull().default(true),
  claimedBy: integer('claimed_by').references(() => users.id, { onDelete: 'set null' }),
  claimedAt: timestamp('claimed_at'),
  fulfilledAt: timestamp('fulfilled_at'),
});

/* ─── THREADS ───────────────────────────────────────────── */
const threads = pgTable('threads', {
  id: serial('id').primaryKey(),
  participantA: integer('participant_a').references(() => users.id),
  participantB: integer('participant_b').references(() => users.id),
  postId: integer('post_id').references(() => posts.id),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at').defaultNow(),
});

/* ─── MESSAGES ──────────────────────────────────────────── */
const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  threadId: integer('thread_id').references(() => threads.id),
  senderId: integer('sender_id').references(() => users.id),
  body: text('body').notNull(),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

/* ─── COMPLETIONS ───────────────────────────────────────── */
const completions = pgTable('completions', {
  id: serial('id').primaryKey(),
  threadId: integer('thread_id').references(() => threads.id),
  confirmedBy: integer('confirmed_by').references(() => users.id),
  confirmedAt: timestamp('confirmed_at').defaultNow(),
});

/* ─── THANK YOU NOTES ───────────────────────────────────── */
const thankYouNotes = pgTable('thank_you_notes', {
  id: serial('id').primaryKey(),
  threadId: integer('thread_id').references(() => threads.id),
  authorId: integer('author_id').references(() => users.id),
  recipientId: integer('recipient_id').references(() => users.id),
  body: text('body').notNull(),
  isAnonymous: boolean('is_anonymous').default(false),
  isDisplayed: boolean('is_displayed').default(false),
  isRemoved: boolean('is_removed').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

/* ─── VOUCHES ───────────────────────────────────────────── */
const vouches = pgTable(
  'vouches',
  {
    id: serial('id').primaryKey(),
    threadId: integer('thread_id').references(() => threads.id),
    voucherId: integer('voucher_id').references(() => users.id),
    voucheeId: integer('vouchee_id').references(() => users.id),
    note: text('note'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    threadVoucherUnique: unique('vouches_thread_id_voucher_id_key').on(
      table.threadId,
      table.voucherId
    ),
  })
);

/* ─── EVENTS ────────────────────────────────────────────── */
const events = pgTable('events', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id').references(() => orgs.id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  eventDate: varchar('event_date', { length: 100 }),
  eventTime: varchar('event_time', { length: 100 }),
  location: varchar('location', { length: 255 }),
  isRecurring: boolean('is_recurring').default(false),
  capacity: integer('capacity'),
  rsvpCount: integer('rsvp_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  isRemoved: boolean('is_removed').default(false),
  type: varchar('type', { length: 50 }).default('event'),
});

/* ─── EVENT RSVPS ───────────────────────────────────────── */
const eventRsvps = pgTable(
  'event_rsvps',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id').references(() => events.id),
    userId: integer('user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    eventUserUnique: unique('event_rsvps_event_id_user_id_key').on(
      table.eventId,
      table.userId
    ),
  })
);

/* ─── ORG MEMBERS ───────────────────────────────────────── */
const orgMembers = pgTable('org_members', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id').references(() => orgs.id),
  userId: integer('user_id').references(() => users.id),
  role: varchar('role', { length: 20 }).default('member'),
  status: varchar('status', { length: 20 }).default('pending'),
  joinedAt: timestamp('joined_at').defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/* ─── ORG ANNOUNCEMENTS ─────────────────────────────────── */
const orgAnnouncements = pgTable('org_announcements', {
  id: serial('id').primaryKey(),
  orgId: integer('org_id').references(() => orgs.id),
  authorId: integer('author_id').references(() => users.id),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  isRemoved: boolean('is_removed').default(false),
});

/* ─── EMAIL VERIFICATIONS ───────────────────────────────── */
const emailVerifications = pgTable('email_verifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
});

/* ─── PASSWORD RESETS ───────────────────────────────────── */
const passwordResets = pgTable('password_resets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
});

/* ─── SESSIONS ──────────────────────────────────────────── */
// Note: id is a string (session token), not a serial integer.
const sessions = pgTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: integer('user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
});

/* ─── REPORTS ───────────────────────────────────────────── */
const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  reporterId: integer('reporter_id').references(() => users.id),
  contentType: varchar('content_type', { length: 50 }).notNull(),
  contentId: integer('content_id').notNull(),
  reason: varchar('reason', { length: 100 }).notNull(),
  otherText: text('other_text'),
  status: varchar('status', { length: 20 }).default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
  resolvedBy: integer('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at'),
  resolutionNote: text('resolution_note'),
});

module.exports = {
  users,
  orgs,
  posts,
  threads,
  messages,
  completions,
  thankYouNotes,
  vouches,
  events,
  eventRsvps,
  orgMembers,
  orgAnnouncements,
  emailVerifications,
  passwordResets,
  sessions,
  reports,
};
