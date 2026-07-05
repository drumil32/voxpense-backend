# Voxpense — API (Backend)

Backend for **Voxpense**, a voice-driven budget & expense tracker (₹ / INR). Speak your spends and an AI agent logs them; supports budgets, recurring budgets, subscriptions, and analytics.

**Frontend repo:** https://github.com/drumil32/voxpense-frontend

## Features
- Email/password auth with JWT (single active session per user)
- Monthly & yearly budgets, with optional **recurring** budgets that roll forward automatically
- Transactions with categories and dates; date is validated to fall inside the budget's period
- **AI voice → transaction**: audio is transcribed (`gpt-4o-mini-transcribe`) and an agent (`@openai/agents`, `gpt-4o`) extracts one or many expenses (incl. relative dates like "yesterday", "the 5th")
- **Subscriptions** (recurring transactions): daily/weekly/monthly/quarterly/yearly, auto-charged by a scheduler until an end date; editable and cancellable
- Category analytics data

## Stack
Node, Express, TypeScript, MongoDB (Mongoose), JWT, bcrypt, OpenAI (transcription + Agents SDK), Zod, node-cron.

## Getting started
```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev               # http://localhost:3000
```
Requires a running MongoDB and an OpenAI API key.

### Environment (`.env`)
| Var | Purpose |
|-----|---------|
| `PORT` | API port (default 3000) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | secret for signing JWTs |
| `CLIENT_ORIGIN` | allowed CORS origin (the frontend URL) |
| `OPENAI_API_KEY` | key for transcription + the AI agent |

## Scripts
- `npm run dev` — watch mode (nodemon + ts-node)
- `npm run build` — compile to `dist/`
- `npm start` — run the compiled server
- `npm run typecheck` — `tsc --noEmit`

## API
Send `Authorization: Bearer <token>` on all non-auth routes.

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/signin` | Login → JWT |
| GET  | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Clear token |
| POST/GET | `/api/budgets` | Create / list budgets |
| GET/PATCH | `/api/budgets/:id` | Get / update (name, amount, recurring) |
| POST/GET | `/api/transactions` | Create / list transactions |
| PATCH | `/api/transactions/:id` | Edit a transaction |
| POST | `/api/ai/transcribe` | Audio → text |
| POST | `/api/ai/agent` | Text → transaction(s) |
| POST | `/api/ai/voice` | Audio → transcription + agent (one call) |
| POST/GET | `/api/subscriptions` | Create / list subscriptions |
| PATCH | `/api/subscriptions/:id` | Edit a subscription |
| POST | `/api/subscriptions/:id/cancel` | Cancel (keeps past charges) |

### Internal (scheduler) — not user-auth
| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/internal/run-jobs` | `x-cron-secret` header | Roll recurring budgets forward + generate due subscription charges |

Example:
```bash
curl -X POST https://<api-host>/api/internal/run-jobs \
  -H "x-cron-secret: $CRON_SECRET"
# → { "success": true, "budgetsCreated": 2, "chargesCreated": 5 }
```

## Background jobs
The scheduled work is `runDailyJobs()` — it rolls recurring budgets forward, then generates due subscription charges into the right budget period. This app does **not** schedule anything itself; a **separate scheduler server** is expected to call `POST /api/internal/run-jobs` (with the `x-cron-secret` header) on a cadence (e.g. daily). The job is idempotent, so extra calls are safe.

## Project structure
```
src/
  config/        db + OpenAI client
  models/        User, Budget, Transaction, Subscription
  services/      transaction / budget / subscription logic (validation lives here)
  controllers/   request handlers
  routes/        Express routers
  ai/            the @openai/agents agent + tools
  jobs/          recurring budgets + subscription scheduler
  utils/         period math
```
