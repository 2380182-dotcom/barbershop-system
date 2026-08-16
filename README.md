# Barber Shop Management — Phase 1

Foundation only: project scaffold, database schema, authentication, and shop
setup (barbers, services, hours). See `phase1-brief.md` for the full spec.

## Stack

- `frontend/` — React + Vite
- `backend/` — Node.js + Express, session-cookie auth (`connect-pg-simple`), PostgreSQL

One database per shop. No `shop_id` column anywhere.

## Prerequisites

- Node.js 20+
- PostgreSQL, with a role and empty database for this shop, e.g.:

  ```bash
  sudo -u postgres createuser -s <your-os-username>
  sudo -u postgres createdb -O <your-os-username> barber_dev
  ```

## Backend setup

```bash
cd backend
npm install
cp .env.example .env   # fill in DATABASE_URL, SESSION_SECRET
npm run migrate:up     # run migrations
OWNER_PASSWORD=<pick-one> npm run seed   # creates shop_settings, owner login, barbers, services
npm run dev             # http://localhost:4000
```

To roll back the schema: `npm run migrate:down`.

Run tests (includes the `businessDate` Karachi-timezone test):

```bash
npm test
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to localhost:4000
```

## Login

Use the `OWNER_USERNAME` (default `owner`) and the `OWNER_PASSWORD` you set
when seeding. Owner role reaches Shop Settings, Barbers, and Services. Barber
accounts (created from the Barbers screen) can only log in — settings/barbers
routes reject them with 403 at the backend, regardless of what the UI shows.

## Secrets

`SESSION_SECRET`, `DATABASE_URL`, and `OWNER_PASSWORD` are never committed —
`.env` is gitignored. `.env.example` documents the shape only.
