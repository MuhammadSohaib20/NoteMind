# Deploying NoteMind on Cloudflare

The live URL `https://notemind.sohaibzaheer1987.workers.dev` is a Cloudflare **Worker**.
This is how to make it serve the real application.

## What the current deployment does

The Worker was uploaded with the **client source folder** as its static assets, not the Vite
build output. That is why the site is blank:

| Request | Current result |
| --- | --- |
| `/` | Vite's development `index.html` (`<script src="/src/main.tsx">`) |
| `/src/main.tsx`, `/src/App.tsx`, `/vite.config.ts`, `/wrangler.toml` | Downloadable source files |
| `/assets/*` | 404 — no build ever ran |
| `/api/*`, `/health` | 404 — the Express API is not deployed |

The old `client/public/_redirects` also proxied `/api/*` to `https://api.notemind.com`,
a hostname that does not resolve.

## Target architecture

```
Browser
  └─ https://notemind.sohaibzaheer1987.workers.dev   (Cloudflare Worker)
       ├─ /, /assets/*, client-side routes  →  built SPA from client/dist
       └─ /api/*, /health                    →  API_ORIGIN (Express + PostgreSQL)
```

- `client/wrangler.jsonc` defines the Worker: assets from `./dist`, SPA fallback, and
  `run_worker_first` for `/api/*` and `/health`.
- `client/worker/index.ts` proxies those two paths to `API_ORIGIN` and returns a clear
  `503 api_not_configured` JSON response while the origin is missing.
- The browser only talks to one origin, so the relative `BASE_URL = '/api/v1'` in
  `client/src/api/client.ts` keeps working and CORS never applies.

## 1. Deploy the Worker

### Option A — Cloudflare dashboard (Git-connected build)

1. Cloudflare dashboard → **Workers & Pages** → open the `notemind` Worker → **Settings** →
   **Build**.
2. Connect the GitHub repository `MuhammadSohaib20/NoteMind`, branch `main`.
3. Set:
   - **Root directory**: `client`
   - **Build command**: `npm ci && npm run build`
   - **Deploy command**: `npx wrangler deploy`
4. Save and deploy.

The Worker name comes from `client/wrangler.jsonc` (`"name": "notemind"`). Keep it in sync
with the dashboard project, or the deploy creates a second hostname.

### Option B — GitHub Actions

`.github/workflows/ci.yml` already builds the client and runs
`cloudflare/wrangler-action@v3` on every push to `main`. Add two repository secrets:

- `CLOUDFLARE_API_TOKEN` — Workers Scripts:Edit, Account:Read
- `CLOUDFLARE_ACCOUNT_ID`

The deploy step is skipped when the secrets are absent.

### Option C — Manual

```bash
cd client
npm ci
npm run build
npx wrangler deploy
```

## 2. Point the Worker at the API

`API_ORIGIN` is read from the Worker environment. Store it as a **secret**, not a plain
variable: `wrangler deploy` rewrites plain variables from the config but leaves secrets
alone.

```bash
cd client
npx wrangler secret put API_ORIGIN
# paste: https://<your-api-host>
```

Dashboard equivalent: **Workers & Pages → notemind → Settings → Variables and Secrets →
Add → Secret**. Use the API's base URL only — no path, no trailing slash.

## 3. Run the Express API

The API needs a Node runtime, PostgreSQL 16, and the `pgvector` extension. It cannot run on
Workers or Pages Functions as-is (native canvas, tesseract OCR, PDF rasterisation, `pg` pools).

### Option A — Cloudflare Tunnel from this machine (no code changes)

```bash
# Docker Desktop must be running
docker compose up --build -d
curl http://localhost:3000/health

# Terminal 2 — public HTTPS URL for the local API
cloudflared tunnel --url http://localhost:3000
```

Use the printed `https://<random>.trycloudflare.com` URL as `API_ORIGIN`.

- Free, all features work (pgvector, OCR, Gemini/Groq).
- The URL changes on every tunnel restart; the PC must stay awake.
- For a stable hostname, create a *named* tunnel and route a hostname from a domain whose
  DNS is managed by Cloudflare.

### Option B — Container host + managed PostgreSQL (permanent)

1. Create a PostgreSQL 16 database with pgvector (Neon, Supabase, …) and copy its
   connection string.
2. Create a web service from this repository's `Dockerfile`
   (Render / Fly.io / Railway / any VPS with Docker).
3. Set environment variables:
   - `DATABASE_URL` — pooled connection string
   - `JWT_SECRET` — 48+ random characters
   - `GEMINI_API_KEY`, `GROQ_API_KEY` — see `.env.example`
   - `NODE_ENV=production`
4. Health check path: `/health`. Migrations are applied automatically at boot by
   `getDatabase()` in `src/db.ts`.
5. Put the service's public URL into `API_ORIGIN` (step 2).

Free container tiers are usually 512 MB RAM; the OCR path (`@napi-rs/canvas`,
`tesseract.js`) can exhaust that on large scanned PDFs. Text notes, search, auth, and
RAG are fine.

## 4. Verify the deployment

```bash
# 1. The built SPA: must reference /assets/index-*.js, never /src/main.tsx
curl -s https://notemind.sohaibzaheer1987.workers.dev/ | head -n 20

# 2. The proxied API: 200 with {"status":"ok","database":"ok"}
curl -s https://notemind.sohaibzaheer1987.workers.dev/health

# 3. A client-side route must return index.html, not 404
curl -s -o /dev/null -w '%{http_code}\n' https://notemind.sohaibzaheer1987.workers.dev/settings
```

Before `API_ORIGIN` is set, step 2 returns `503 {"error":"api_not_configured"}` on purpose.

## Local check without deploying

```bash
cd client
npm ci
npm run build
npx wrangler dev --var API_ORIGIN:http://localhost:3000
```

Open `http://localhost:8787`. `wrangler dev` serves `dist/` and proxies `/api/*` to the
local Express server, exactly like production.
