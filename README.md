# Prema

**A free mutual aid tool at [prema.red](https://prema.red)**

Post what you need. Post what you can give. No middleman. Just people.

Built and maintained by [The Red Party](https://theparty.red). Open to everyone regardless of political belief or party membership.

---

## What It Is

Prema (Sanskrit for *unconditional love*) is a community platform for mutual aid — the everyday practice of neighbors helping neighbors. You post what you can offer or what you need. Others respond. Real help happens. No money changes hands for services. No followers. No algorithm. No means test.

Local and global scopes: in-person help tied to a neighborhood, and remote skills available to anyone anywhere.

## Current Status

**In active development.**

Frontend is complete and wired to real API endpoints. Backend is in progress — Node.js / Express and PostgreSQL.

---

## Features

### Community Board
- Post abilities and needs across local and global scopes
- Filter by category, search by keyword, sort by type
- **Local categories:** Food, Cleaning, Transport, Housing, Healthcare, Infrastructure, Other
- **Global categories:** Tech/Code, Legal, Art/Design, Writing, Advice, Education, Comrade Support, Other

### Organizations
- Local and global org directory with search
- Full org pages with three tabs: About, Announcements, Events & Opportunities
- Request to join with intention statement
- RSVP to events (members only, with capacity tracking)
- Org announcements separate from events

### Messaging
- On-platform inbox — all contact stays on Prema
- Thread-based conversations tied to posts
- Completion flow: mark as done → confirm → unlock thank you notes and vouching

### Profiles & Reputation
- Public profile: bio, location, active posts, completed helps, vouches, thank you notes
- Vouching system: only unlocked after both parties confirm a completed interaction
- Thank you notes: recipient chooses whether to display them

### Auth
- Sign in / sign up with 4-step onboarding
- Browse without an account — account required to post, respond, or message
- All protected actions are auth-gated with seamless redirect after sign in

### Moderation
- Report flag on posts, profiles, and orgs
- 5 reports triggers automatic takedown pending moderator review
- Reporter is never identified to the person being reported

---

## Tech Stack

### Frontend
- Vanilla HTML, CSS, JavaScript — no framework
- Single page app — JS handles all routing and rendering

### Backend
- **Node.js / Express** — API and auth
- **PostgreSQL** — database
- **bcrypt** — password hashing (cost 12)
- **express-session** — httpOnly cookies, 30-day expiry
- **Resend** — transactional email (verification, password reset)

### Infrastructure
- DigitalOcean — Ubuntu 24.04 LTS, NYC region
- nginx — reverse proxy
- Let's Encrypt SSL via certbot (auto-renewing)
- Both `prema.red` and `theparty.red` on the same droplet

---

## Design

Soviet propaganda poster aesthetic — warm and direct, not a tech product. Red crosshatch background, charcoal cards, parchment nav, gold accents.

- **Fonts:** Cormorant Garamond (display) + Jost (body) via Google Fonts
- **Colors:** `#BB0000` red · `#1C1810` charcoal · `#EDE0C4` parchment · `#C9A84C` gold
- No dark mode — the visual identity is intentional and fixed

---

## File Structure

```
frontend/
  index.html        — full single-page app markup
  script.js         — all JavaScript
  style.css         — all styles
  changelog.txt     — full history of every change
backend/
  server.js         — Express app entry point
  db.js             — PostgreSQL connection
  email.js          — Resend transactional email
  routes/
    auth.js         — signup, signin, verify, password reset
    posts.js        — board posts CRUD
    messages.js     — inbox, threads, completion flow
    users.js        — profiles, settings
    orgs.js         — org directory and management
    admin.js        — admin dashboard
```

---

## What's Next

- [ ] Org admin UI — post announcements, create events, manage members (backend routes complete)
- [ ] Password reset flow — backend complete, not yet wired to frontend
- [ ] Thank you notes and vouches flow — backend complete, not yet wired to frontend
- [ ] Admin dashboard CSS styling — functional but unstyled
- [ ] Deploy to prema.red

---

## Values

Prema does not tolerate intolerance. People or ideas that demean, exclude, or harm others based on who they are have no place here. Openness is not the same as allowing everything — a community built on love and care has no obligation to platform hate.

---

## Who Built This

The Red Party — [theparty.red](https://theparty.red)

---

*"From everyone with an ability, to everyone with a need."*
