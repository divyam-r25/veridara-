# Veridara

**Analyze. Explain. Fix. Verify. Release.**

A GitHub-connected closed-loop release and security verification platform for AI-assisted software development.

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local via Docker or MongoDB Atlas)
- Redis (optional — system runs without it)

### 1. MongoDB

**Option A — Docker (recommended for local):**
```bash
docker-compose up -d mongodb
```

**Option B — MongoDB Atlas (already configured):**
> ⚠️ You must whitelist your IP in Atlas Network Access first:
> https://cloud.mongodb.com → Cluster0 → Security → Network Access → Add IP Address

### 2. Start the Backend
```bash
cd server
npm install
npm run dev
# Server runs on http://localhost:3001
```

### 3. Start the Frontend
```bash
cd client
npm install
npm run dev
# UI runs on http://localhost:5173
```

### 4. Open the App
Go to **http://localhost:5173** and click **"Try Demo Mode"**.

## Deploy to Render

The root-level `render.yaml` builds the API and frontend together for Render.
The Vercel frontend can alternatively call the Render API through the public
`VITE_API_URL` configured in `client/.env.production`.

1. Push this repository (including `render.yaml`) to GitHub.
2. In Render, choose **New** → **Blueprint** and select the repository and the
   branch containing this file.
3. Add the production environment variables listed below. MongoDB and Redis are
   required for the full asynchronous analysis architecture.
4. Set `GITHUB_CALLBACK_URL` to
   `https://veridara.vercel.app/api/auth/github/callback` and register that
   exact URL as the **Authorization callback URL** in the GitHub OAuth app.
   Vercel proxies `/api/*` to Render, so OAuth state and the signed-in session
   stay first-party on the browser's Vercel domain. This avoids failures from
   third-party-cookie blocking.

### Vercel frontend

The root `vercel.json` builds `client`, publishes `client/dist`, and proxies
`/api/*` to the Render API. Keep the Vercel project Root Directory at the
repository root. If the Render API URL changes, update the API rewrite in
`vercel.json`, then redeploy. The Render service must allow the Vercel URL in
`CORS_ORIGINS`.

---

## Demo Flow (no GitHub credentials needed)

1. Click **Try Demo Mode** on the landing page
2. Click **Connect Repository** → select `payment-service`
3. Open the repository → click **Analyze** on PR #42
4. Watch Veridara analyze:
   - 🔴 Hardcoded API secret (`sk-admin-...`)
   - 🔴 Missing authorization on `/payments/:id/refund`
   - 🔴 Command injection via `exec()`
   - 🟠 Prompt injection in README
   - 🟠 New CI/CD pipeline exposing deploy secrets
5. Go to the **AI Fix Pack** tab → copy the remediation prompt
6. Paste into any AI coding agent (ChatGPT, Claude, Cursor, etc.)
7. Click **Simulate Fix & Verify** → see the loop close with improved scores

---

## Architecture

```
Loop Engineering: Observe → Analyze → Explain → Plan → Fix → Verify → Re-analyze → Release
```

### Backend (`/server`)
- **Node.js + Express + TypeScript**
- **MongoDB** (via Mongoose) — all persistent state
- **BullMQ + Redis** — durable async analysis and verification queues (required in production)
- **Octokit** — GitHub API integration
- **Zod** — schema validation for all AI output

### Frontend (`/client`)
- **React + TypeScript + Vite**
- **TanStack Query** — data fetching with auto-polling
- **Tailwind CSS** — dark-mode design system
- **React Router** — client-side routing

### Analysis Pipeline
1. **Change Analyzer** — file risk, test gaps, diff stats
2. **Security Analyzer** — secret detection, prompt injection, sensitive files
3. **Dependency Analyzer** — package.json change risk
4. **API Analyzer** — route/spec breaking changes
5. **AI Analyzer** — reasoning layer (optional, Zod-validated)
6. **Scoring Engine / Loop Controller** — turns findings into a release decision
   and controls re-analysis after verification
7. **Fix Pack Generator** — deterministic markdown remediation prompt

---

## Environment Variables

See `server/.env.example`. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `REDIS_URL` | Yes in production | Redis connection used by BullMQ workers |
| `GITHUB_CLIENT_ID` | No | For real GitHub OAuth (demo works without) |
| `GITHUB_CLIENT_SECRET` | No | For real GitHub OAuth |
| `GITHUB_CALLBACK_URL` | Yes for OAuth | Public API callback URL registered with GitHub |
| `TEST_MONGODB_URI` | Tests only | Dedicated non-production MongoDB connection string; never reuse `MONGODB_URI` |
| `TEST_REDIS_URL` | Tests only | Dedicated non-production Redis URL; never reuse `REDIS_URL` |
| `AI_API_KEY` | No | OpenAI key (system works without AI) |
| `SESSION_SECRET` | Yes | Change in production |
| `CORS_ORIGINS` | Yes in production | Comma-separated allowed frontend origins |
| `CLIENT_URL` | Yes in production | Frontend URL for OAuth redirects |

The Veridara API also recognizes Vercel deployment URLs for the configured
Veridara workspace, so preview/production deployment URLs can use the API
without weakening CORS for unrelated Vercel projects.

---

## Security Notes

- **Context Firewall**: all repo content treated as untrusted input
- **Secret Masking**: secrets detected and masked before any AI call
- **Prompt Injection Detection**: scans for AI manipulation in PRs
- **Session-based auth**: httpOnly cookies, no JWT exposure
- **Rate limiting**: 200 req/15min on all API routes
