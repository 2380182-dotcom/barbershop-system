# Phase 1 build brief — database schema and auth

Give this whole file to Claude Code as the first message. Build **only** what is in this file. Do not build queue logic, appointments, WhatsApp, or the face scan yet.

---

## 1. What we are building

A management system for a single barber shop. It runs a live walk-in queue on a counter tablet, shows token numbers on a wall TV, remembers each customer's exact haircut, and sends one WhatsApp reminder when that haircut grows out.

Phase 1 is the foundation only: project scaffold, database schema, authentication, and the owner being able to set up his shop (barbers, services, hours).

## 2. Fixed decisions — do not change these

| Decision | Value |
|---|---|
| Frontend | React with Vite |
| Backend | Node.js with Express |
| Database | PostgreSQL |
| Auth | Session cookies (not JWT) |
| Password hashing | bcrypt |
| Tenancy | One database per shop. No `shop_id` column anywhere. |
| Deployment | Many shops on one VPS, one process + one database per shop |
| Repo layout | `frontend/` and `backend/` in one repo |

## 3. The timezone rule — read this before writing any code

The shop runs in `Asia/Karachi`. Postgres `current_date` is UTC and will disagree with the shop's day for about five hours around midnight.

Rules:

1. Store all timestamps as `timestamptz`.
2. Anywhere a **day** matters (token numbers, attendance, reminders, reports), store an explicit `business_date` column of type `date`. Never derive the day from a timestamp at query time.
3. Write **one** helper, `businessDate(at = new Date())`, in the backend. It returns the `Asia/Karachi` calendar date as a `YYYY-MM-DD` string. Every place that needs today's date calls this helper. Nothing else computes a date.
4. Put the shop timezone in the `shop_settings` table so it is not hardcoded.

## 4. Database schema

Write this as a migration. Use `uuid` primary keys with `gen_random_uuid()`.

See `backend/migrations/1700000000000_init.js` for the migration itself.

### Notes on the schema

- `queue_entries.barber_id` being `null` means the customer is in the shared "any barber" line. This is deliberate — do not add a separate table for it.
- `unique (business_date, token_number)` is what makes token numbers reset each morning and never collide.
- `unique (barber_id, starts_at)` on appointments is the double-booking lock. It must be enforced here, not in the UI.
- `style_cards.grow_out_days` is copied from the service at save time, so changing a service later does not rewrite history.

## 5. Authentication

- Session cookies stored in Postgres (`connect-pg-simple`). No JWT.
- Cookie: `httpOnly`, `sameSite=lax`, `secure` in production.
- `bcrypt` with cost 12.
- Login is by `username` + password. Owner and barbers use the same login screen; the role decides what they see.
- Two roles only:
  - **owner** — everything, including settings, barbers, services, reports.
  - **barber** — queue and style cards only. Must not reach any settings or reports route.
- Enforce roles in **backend middleware**, not by hiding buttons in React.
- Rate-limit the login route: 10 attempts per 15 minutes per IP.
- Log every login, failed login, and role-restricted rejection into `audit_logs`.

## 6. Screens to build in Phase 1

Only these four. Keep them plain — visual polish comes later.

1. **Login** — username, password, error message.
2. **Shop settings** (owner only) — shop name, opening and closing time, weekly off day, timezone.
3. **Barbers** (owner only) — add, edit, deactivate. Set working days. Optionally create a login for a barber.
4. **Services** (owner only) — add, edit, deactivate. Name, duration in minutes, price, grow-out days.

Design the settings screens for a desktop or laptop. The tablet and TV screens come in Phase 2.

## 7. Seed data

A seed script that creates:

- One `shop_settings` row
- One owner user, with the password read from an environment variable — **never hardcoded in the repo**
- Three barbers
- Three services: Haircut (30 min, grow-out 21 days), Beard trim (15 min, grow-out 10 days), Haircut + beard (45 min, grow-out 18 days)

## 8. Phase 1 is done when

- [ ] Migrations run clean on an empty database, and can be rolled back.
- [ ] The seed script creates a working owner login.
- [ ] Owner can log in, add a barber, add a service, and set opening hours — and the values persist after a restart.
- [ ] A barber account logging in **cannot** reach the settings or barbers routes, tested by calling the API directly with the barber's session cookie, not just by checking the UI.
- [ ] `businessDate()` returns the correct Karachi date when the server clock is set to 23:30 UTC. Write a test for this.
- [ ] Inserting two `queue_entries` with the same `business_date` and `token_number` fails at the database level.
- [ ] Inserting two `appointments` with the same `barber_id` and `starts_at` fails at the database level.
- [ ] No password, session secret, or database URL appears anywhere in the repo.

## 9. Do not build yet

Queue logic, the wall screen, the QR customer page, style card entry, attendance marking, appointment booking flow, WhatsApp sending, face scan, reports, and the vendor admin dashboard. Those are Phases 2 to 6.
