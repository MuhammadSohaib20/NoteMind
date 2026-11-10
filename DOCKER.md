# Containerised NoteMind (API + frontend in one image)

The repository now has a self-contained Docker setup. **No existing project
files were changed** — only these files were added:

| File | Purpose |
| --- | --- |
| `Dockerfile` | Multi-stage build: compiles the backend and the React client, then produces a small production image that serves both on port `3000`. |
| `.dockerignore` | Keeps `node_modules`, build output, `.env`, local PGlite data and backups out of the build context. |
| `compose.yaml` | Default Docker Compose stack for the app. |
| `docker/entrypoint.sh` | Supplies a persisted fallback `JWT_SECRET` when the container is launched without one (Docker Desktop Run button, plain `docker run`). |
| `.gitattributes` | Keeps the entrypoint script LF-only so it also works when cloned on Windows. |
| `DOCKER.md` | This guide. |

The app embeds **PGlite** (PostgreSQL compiled to WebAssembly), so the
container does **not** need the PostgreSQL service from the older
`docker-compose.yml`. That file is untouched and still works for local
Prisma/pgvector tooling if you need it.

---

## Quick start

1. Create your environment file (if you do not already have one):

   ```bash
   cp .env.example .env
   ```

   At minimum set a strong `JWT_SECRET`. Set `GEMINI_API_KEY` (and optionally
   `GROQ_API_KEY`) to enable the RAG features.

   If you skip this file, the container still starts: the entrypoint generates
   a random `JWT_SECRET` automatically. AI/RAG features stay disabled until the
   provider keys are provided.

2. Build and start:

   ```bash
   docker compose up --build -d
   ```

   `docker compose` picks up `compose.yaml` automatically. Because the original
   `docker-compose.yml` was intentionally left untouched, Compose may print a
   one-line "Found multiple config files" warning — it confirms `compose.yaml`
   is the file being used and is safe to ignore.

3. Open <http://localhost:3000>.

To use a different host port:

```bash
# PowerShell
$env:APP_PORT="8080"; docker compose up --build -d
# bash
APP_PORT=8080 docker compose up --build -d
```

---

## Common commands

```bash
# Follow logs
docker compose logs -f app

# Container / health status
docker compose ps

# Rebuild after a code change
docker compose up --build -d

# Stop (data is kept)
docker compose down

# Stop and delete the database, cache, and backup volumes
docker compose down -v
```

Health endpoint: <http://localhost:3000/health>

---

## One-command start + status check

PowerShell (Windows):

```powershell
docker compose up --build -d; while ((docker inspect -f '{{.State.Health.Status}}' notemind-app) -eq 'starting') { Start-Sleep 2 }; docker compose ps; curl.exe -s http://localhost:3000/health
```

Bash / macOS / Linux:

```bash
docker compose up --build -d && until [ "$(docker inspect -f '{{.State.Health.Status}}' notemind-app)" = "healthy" ]; do sleep 2; done && docker compose ps && curl -fsS http://localhost:3000/health
```

Expected result: `STATUS` shows `Up ... (healthy)` and `/health` returns
`{"status":"ok",...}`.

---

## Persistence

The stack uses three named volumes, so rebuilding the image never loses data:

| Volume | Container path | Contents |
| --- | --- | --- |
| `notemind_pglite_data` | `/app/.pglite-data` | The embedded PostgreSQL database (notes, users, embeddings). |
| `notemind_ai_cache` | `/app/.ai-cache` | Cached embedding vectors (saves AI provider quota). |
| `notemind_backups` | `/app/backups` | Output directory used by the backup/restore script. |

Back up the database by copying the `pglite_data` volume, for example:

```bash
docker run --rm -v notemind_pglite_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/notemind-pglite-backup.tar.gz -C /data .
```

> PGlite is a single-writer embedded database. Run exactly **one** app replica;
> do not scale this service horizontally.

---

## Security notes

- The image contains **no** `.env`, API keys, or JWT secret — `.dockerignore`
  keeps them out of the build context.
- An explicit `JWT_SECRET` always wins. The auto-generated fallback is used
  only when none is supplied.
- Generated secrets come from `crypto.randomBytes(48)` (96 hex characters) and
  are created with owner-only permissions (`umask 077`, then `chmod 600`) at
  `/app/.pglite-data/.jwt_secret`.
- That file is stored inside the database volume, which is already sensitive:
  anyone who can read that volume can read the database. Protect and encrypt
  backups accordingly.
- The app runs as the non-root `node` user. Do not run it with `--privileged`
  or mount the Docker socket into it.
- For production, set `JWT_SECRET` explicitly and run exactly one replica
  (PGlite is single-writer).

---

## Environment variables

`compose.yaml` uses `env_file: .env`, so the same variables as local
development are injected at runtime. The image itself never contains `.env`
or API keys. `PORT` is forced to `3000` inside the container, and
`AI_CACHE_DIR` is pointed at the mounted cache volume.

Useful variables from `.env.example`:

- `JWT_SECRET` — signing key for auth tokens. Set it explicitly in production;
  if omitted, the entrypoint generates and persists a random one.
- `GEMINI_API_KEY` — enables embeddings and answer generation.
- `GROQ_API_KEY` — optional fallback generation provider.
- `AI_*`, `PDF_*` — RAG/OCR tuning knobs.
- `APP_PORT` — host port only; set in your shell or `.env`, not needed by the app.

---

## Run without Compose

```bash
docker build -t notemind:local .

docker run -d --name notemind-app \
  --init \
  -p 3000:3000 \
  --env-file .env \
  -e AI_CACHE_DIR=/app/.ai-cache \
  -v notemind_pglite_data:/app/.pglite-data \
  -v notemind_ai_cache:/app/.ai-cache \
  -v notemind_backups:/app/backups \
  notemind:local
```

---

## Troubleshooting

### `Error: JWT_SECRET is not set`

This is handled automatically now. If no `JWT_SECRET` is injected — for
example when using Docker Desktop's **Run** button or a plain `docker run`
without `--env-file` — `docker/entrypoint.sh` generates a strong random secret
and stores it at `/app/.pglite-data/.jwt_secret`.

- With a persisted `/app/.pglite-data` volume, the same secret is reused on
  restart, so existing login sessions stay valid.
- Without a volume, both the secret and the database are ephemeral. That is
  fine for a quick test; use Compose for real data.
- An explicit `JWT_SECRET` (from `.env`, `--env-file`, `-e`, or Docker
  Desktop's environment fields) always takes precedence.
- To store the generated secret elsewhere, set `JWT_SECRET_FILE`.

For production, still set `JWT_SECRET` explicitly. Use Compose from the project
root (recommended):

```bash
docker compose up --build -d
```

Or pass the file explicitly:

```bash
docker run -d --name notemind-app --init -p 3000:3000 \
  --env-file .env \
  -e AI_CACHE_DIR=/app/.ai-cache \
  -v notemind_pglite_data:/app/.pglite-data \
  -v notemind_ai_cache:/app/.ai-cache \
  -v notemind_backups:/app/backups \
  notemind-app:local
```

When using the Docker Desktop Run dialog, add a volume for
`/app/.pglite-data` if you want notes and the generated secret to survive
container replacement.

### `Found multiple config files` warning

Compose sees both `compose.yaml` (the app stack) and the untouched legacy
`docker-compose.yml` (PostgreSQL only). It uses `compose.yaml`; the warning is
informational.

### Port 3000 is already in use

Choose another host port:

```bash
APP_PORT=8080 docker compose up -d
```

---

## What happens on first boot

1. Express starts and PGlite initialises `/app/.pglite-data`.
2. The SQL files in `prisma/migrations/` are applied automatically.
3. The compiled frontend is served by Express from `/app/client/dist`.
4. The container reports healthy once `GET /health` succeeds.

OCR works offline: `eng.traineddata` is bundled into the image and the
tesseract.js worker is configured to read it from `/app`.
