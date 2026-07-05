# Budget Tracker — API (Backend)

Node + Express + TypeScript + MongoDB backend for the Budget Tracker app. Provides auth, budgets, transactions, AI voice → transaction, recurring budgets, and subscriptions.

## Stack
Express, TypeScript, Mongoose (MongoDB), JWT auth, OpenAI (`gpt-4o-mini-transcribe` + `@openai/agents`), node-cron.

## Setup
```bash
npm install
cp .env.example .env   # then fill in the values
npm run dev            # http://localhost:3000
```

### Environment (`.env`)
| Var | Purpose |
|-----|---------|
| PORT | API port (default 3000) |
| MONGO_URI | MongoDB connection string |
| JWT_SECRET | secret for signing JWTs |
| CLIENT_ORIGIN | allowed CORS origin (frontend URL) |
| OPENAI_API_KEY | key for transcription + the AI agent |

## Scripts
- `npm run dev` — watch mode (ts-node + nodemon)
- `npm run build` — compile to `dist/`
- `npm start` — run compiled server
- `npm run typecheck` — `tsc --noEmit`

## API (summary)
Auth: `POST /api/auth/signup|signin|logout`, `GET /api/auth/me`
Budgets: `POST/GET /api/budgets`, `GET/PATCH /api/budgets/:id`
Transactions: `POST/GET /api/transactions`, `PATCH /api/transactions/:id`
AI: `POST /api/ai/transcribe`, `POST /api/ai/agent`, `POST /api/ai/voice`
Subscriptions: `POST/GET /api/subscriptions`, `PATCH /api/subscriptions/:id`, `POST /api/subscriptions/:id/cancel`

All non-auth routes require `Authorization: Bearer <token>` (single active session per user).

## Background jobs
A daily `node-cron` job (plus a boot catch-up) rolls recurring budgets forward and generates due subscription charges. See `TODO.md` for the plan to move this to an external scheduler.
