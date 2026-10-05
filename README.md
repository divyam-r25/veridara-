# ReleaseRadar

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

The root-level `render.yaml` deploys the frontend and API together as one web
service, so browser requests and session cookies use the same origin.

1. Push this repository (including `render.yaml`) to GitHub.
2. In Render, choose **New** → **Blueprint** and select the repository and the
   branch containing this file.
3. Provide `MONGODB_URI` using your MongoDB Atlas connection string. The demo
   needs MongoDB; Redis remains optional.
4. Add GitHub and AI credentials only if you want those integrations. For
   GitHub OAuth, set `GITHUB_CALLBACK_URL` to
   `https://<your-render-service>.onrender.com/api/auth/github/callback` after
   the first deploy.

---

## Demo Flow (no GitHub credentials needed)

1. Click **Try Demo Mode** on the landing page
2. Click **Connect Repository** → select `payment-service`
3. Open the repository → click **Analyze** on PR #42
4. Watch ReleaseRadar analyze:
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
- **BullMQ + Redis** — async analysis queue (optional)
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
6. **Scoring Engine** — weighted deterministic score (0–100)
7. **Fix Pack Generator** — deterministic markdown remediation prompt

---

## Environment Variables

See `server/.env.example`. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `GITHUB_CLIENT_ID` | No | For real GitHub OAuth (demo works without) |
| `GITHUB_CLIENT_SECRET` | No | For real GitHub OAuth |
| `AI_API_KEY` | No | OpenAI key (system works without AI) |
| `SESSION_SECRET` | Yes | Change in production |

---

## Security Notes

- **Context Firewall**: all repo content treated as untrusted input
- **Secret Masking**: secrets detected and masked before any AI call
- **Prompt Injection Detection**: scans for AI manipulation in PRs
- **Session-based auth**: httpOnly cookies, no JWT exposure
- **Rate limiting**: 200 req/15min on all API routes
