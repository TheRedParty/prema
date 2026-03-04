# Cariño

**A free mutual aid tool at [carino.red](https://carino.red)**

Post what you need. Post what you can give. No middleman. Just people.

Built and maintained by [The Red Party](https://theparty.red). Open to everyone regardless of political belief or party membership.

---

## What It Is

Cariño (Spanish for *tenderness*) is a community platform for mutual aid — the everyday practice of neighbors helping neighbors. You post what you can offer or what you need. Others respond. Real help happens. No money changes hands for services. No followers. No algorithm. No means test.

Local and global scopes: in-person help tied to a neighborhood, and remote skills available to anyone anywhere.

## Current Status

**Front-end prototype — complete.**

The full intended user experience. All features listed below are functional in the front-end. Backend, database, and real auth are planned next.

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
- On-platform inbox — all contact stays on Cariño
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

### Current (front-end prototype)
- Vanilla HTML, CSS, JavaScript — no framework
- Single page app — JS handles all routing and rendering
- Served as static files via nginx on DigitalOcean

### Planned (backend)
- **Node.js / Express** — API and auth
- **PostgreSQL** — database
- **Resend** — transactional email (verification, notifications)
- Same DigitalOcean droplet, nginx as reverse proxy

### Infrastructure
- DigitalOcean — Ubuntu 24.04 LTS, NYC region
- Let's Encrypt SSL via certbot (auto-renewing)
- Both `carino.red` and `theparty.red` on the same droplet

---

## Design

Soviet propaganda poster aesthetic — warm and direct, not a tech product. Red crosshatch background, charcoal cards, parchment nav, gold accents.

- **Fonts:** Cormorant Garamond (display) + Jost (body) via Google Fonts
- **Colors:** `#BB0000` red · `#1C1810` charcoal · `#EDE0C4` parchment · `#C9A84C` gold
- No dark mode — the visual identity is intentional and fixed

---

## File Structure

```
index.html        — full single-page app markup
script.js         — all JavaScript (~1400 lines)
style.css         — all styles
changelog.txt     — full history of every change
README.md         — this file
```

---

## What's Next

- [x] Admin dashboard (planned, not started — needs its own design session)
- [x] Node.js / Express backend
- [x] PostgreSQL database and schema
- [x] Real auth (bcrypt, session tokens, httpOnly cookies)
- [x] Email verification via Resend
- [x] Real post creation and persistence
- [ ] Organization management
- [ ] Notification system

---

## Values

Cariño does not tolerate intolerance. People or ideas that demean, exclude, or harm others based on who they are have no place here. Openness is not the same as allowing everything — a community built on love and care has no obligation to platform hate.

---

## Who Built This

The Red Party — [theparty.red](https://theparty.red)


---

*"The everyday love between neighbors. Not romantic, not grand. The love of someone making you food, giving you a ride, offering their time freely."*
