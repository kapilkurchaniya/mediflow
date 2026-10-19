# 08 · Local setup

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 22 LTS (20.10+ works) | `node -v` |
| npm | 10+ | `npm -v` |
| PostgreSQL | 14+ (16 recommended), local or Docker | `psql --version` |
| GitHub CLI (for PRs) | any recent | `gh --version` |

## 1. Clone, install, pick your lane

```bash
git clone https://github.com/kapilkurchaniya/mediflow.git && cd mediflow
npm install                      # installs deps AND the git pre-push hook
git config mediflow.lane a       # or b — see 07-git-workflow.md
git switch lane-a/overxpowered   # or lane-b/kapil
```

## 2. Database

Option A, Docker (recommended; `docker-compose.yml` is added in Roadmap A0.4):

```bash
docker compose up -d db          # Postgres 16 on localhost:5432, user/pass mediflow/mediflow
```

Option B, local Postgres:

```bash
createdb mediflow
```

The migration script creates the `pg_trgm` and `pgcrypto` extensions itself (`src/server/db/migrate.ts`). Your DB user needs permission to create extensions. Superuser is fine locally.

## 3. Environment variables

Copy `.env.example` (added in Roadmap B0.6) to `.env` and fill it in. Today the code reads these variables:

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `DATABASE_URL` | ✅ | everything (`src/env.ts`) | `postgres://mediflow:mediflow@localhost:5432/mediflow` |
| `GEMINI_API_KEY` | for AI | `api/chat/route.ts`, `server/ai.ts` | README says `GOOGLE_GENERATIVE_AI_API_KEY`, which is **wrong**; the code reads `GEMINI_API_KEY` |
| `GROQ_API_KEY` | for AI fallback | same | |
| `TAVILY_API_KEY` | optional | `server/ai.ts` (web search for enrichment) | |
| `COHERE_API_KEY` | optional | `scripts/test-api-keys.mjs` only | |
| `WHATSAPP_VERIFY_TOKEN` | for WhatsApp webhook | `api/webhooks/whatsapp/route.ts` | |
| ➕ `APP_ENCRYPTION_KEY` | from Phase 0 | `server/crypto.ts` | 32 random bytes, base64. Encrypts stored API tokens. |
| ➕ `WHATSAPP_APP_SECRET` | from Phase 0 | webhook signature check | From the Meta app dashboard |
| ➕ `CRON_SECRET` | from Phase 2 | `/api/cron/*` | Random string; the scheduler sends it as a Bearer token |
| ➕ `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | production, multi-instance | Next.js | Keep stable across instances (see Next docs: data-security) |

`SESSION_SECRET` in the README is **not used**. Sessions are random tokens hashed with SHA-256 and need no secret.

## 4. Migrate and seed

```bash
npm run db:migrate               # (script added in A0.2; today: npx tsx src/server/db/migrate.ts)
npx tsx scripts/setup-db.ts      # creates tenant "Apollo Pharmacy", login admin@apollo.com / admin123
npx tsx scripts/seed-dataset.ts  # loads the Indian medicine dataset (needs the dataset — see below)
npx tsx scripts/generate-stock.ts
```

> ⚠️ `scripts/Indian-Medicine-Dataset` is a **broken submodule** (a gitlink with no `.gitmodules`). After a fresh clone it's empty. Roadmap B0.7 fixes it, either with a proper `.gitmodules` pointing at the dataset's upstream repo or by downloading the CSV in a script. Until then, ask Kapil for the CSV.

> ⚠️ `scripts/migrate-tenant.ts` contains hard-coded tenant UUIDs. **Don't run it.** It's deleted in Roadmap B0.7.

## 5. Run

```bash
npm run dev                      # http://localhost:3000
```

Log in with `admin@apollo.com` / `admin123`, or register a new pharmacy at `/register`.

## 6. Before every push

```bash
npm run typecheck && npm test && npm run lint
```

CI runs the same commands plus `npm run build`.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `❌ Invalid environment variables` at boot | `DATABASE_URL` is missing or not a URL |
| `relation "xyz" does not exist` | Your DB is behind the migrations. Run `npm run db:migrate`. If the DB was made with `push`, recreate it (04-database.md). |
| `extension "pg_trgm" is not available` | Install `postgresql-contrib` (Debian/Ubuntu) or use the Docker image |
| Redirect loop to `/login` | Stale cookie for a deleted session. Clear cookies for localhost. |
| AI assistant returns 401 | Your session has no store. Log in again after the tenant has a store. |
