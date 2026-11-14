# Containerised NoteMind (PostgreSQL + API + frontend)

The repository ships a two-service Docker Compose stack:

| Service | Image | Purpose |
| --- | --- | --- |
| `db` | `pgvector/pgvector:pg16` | PostgreSQL 16 with the `vector` extension. Data lives in the `notemind_postgres_data` volume. |
| `app` | built from `Dockerfile` | Multi-stage build that compiles the Express API and the React client, then serves both on port `3000`. |

`compose.yaml` is the only Compose file. The app waits for the database health
check, applies pending migrations under a PostgreSQL advisory lock, and only
then starts accepting traffic.

---

## Quick start

1. Create your environment file:

   ```bash
   cp .env.example .env
   ```

   Set at minimum:

   - `POSTGRES_PASSWORD` — a long, URL-safe value (letters, digits, `-`, `_`,
     `.`, `~`). It is embedded in the app's internal `DATABASE_URL`.
   - `JWT_SECRET` — a long random string. If omitted, the entrypoint generates
     one and persists it in the `notemind_app_secrets` volume.
   - `GEMINI_API_KEY` and optionally `GROQ_API_KEY` to enable RAG.

   Generate secrets without printing them:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   `.env` is Git-ignored and excluded from the image by `.dockerignore`.

2. Build and start:

   ```bash
   docker compose up --build -d
   ```

3. Open <http://localhost:3000>.

To use a different host port:

```bash
# PowerShell
$env:APP_PORT="8080"; docker compose up --build -d
# bash
APP_PORT=8080 docker compose up --build -d
```

The database port is published on loopback only
(`127.0.0.1:${POSTGRES_PORT:-5432}`) for native `npm` tooling. Other machines
reach NoteMind through port `3000`; they share the same accounts and notes
because they all talk to the same PostgreSQL database.

---

## Common commands

```bash
# Follow logs
docker compose logs -f app
docker compose logs -f db

# Container / health status
docker compose ps

# Rebuild after a code change
docker compose up --build -d

# Stop (data is kept)
docker compose down

# Stop and delete the database, cache, secrets, and backup volumes
docker compose down -v
```

Health endpoint: <http://localhost:3000/health>. It returns `200` only when the
API can reach PostgreSQL; otherwise it returns `503` and Docker marks the
container unhealthy.

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
`{"status":"ok","database":"ok",...}`.

---

## Persistence

| Volume | Container path | Contents |
| --- | --- | --- |
| `notemind_postgres_data` | `/var/lib/postgresql/data` (db) | Users, notes, collections, tags, embeddings. |
| `notemind_app_secrets` | `/app/secrets` (app) | Generated fallback `JWT_SECRET` when none is supplied. |
| `notemind_ai_cache` | `/app/.ai-cache` | Cached embedding vectors (saves AI provider quota). |
| `notemind_backups` | `/app/backups` | Output directory used by the backup/restore script. |
| `notemind_pglite_data` | not mounted | Legacy embedded database, kept for the one-time migration and rollback. It is deliberately not declared in `compose.yaml`, so `docker compose down -v` cannot delete it. |

Rebuilding the app image never touches these volumes. `docker compose down -v`
deletes them.

### Backups

For a production-grade logical backup, use `pg_dump`:

```bash
# bash
docker compose exec -T db pg_dump -U notemind -d notemind -Fc > backups/notemind-$(date +%Y%m%d-%H%M).dump
```

```powershell
# PowerShell
docker compose exec -T db pg_dump -U notemind -d notemind -Fc > "backups\notemind-$(Get-Date -Format yyyyMMdd-HHmm).dump"
```

Restore into a fresh database (never over the live one without a tested
backup):

```bash
docker compose exec -T db createdb -U notemind notemind_restore
docker compose exec -T db pg_restore -U notemind -d notemind_restore --no-owner < backups/notemind-20260101-1200.dump
```

The repeatable restore drill is available as:

```bash
npm run db:backup-restore
```

It takes a transactionally consistent snapshot, restores it into a throwaway
database, replays every migration, compares row counts, then drops the
throwaway database. See [BACKUP_RESTORE_DRILL.md](BACKUP_RESTORE_DRILL.md).

---

## Migrating the old PGlite data (one time)

The previous deployment stored accounts and notes in the
`notemind_pglite_data` volume. Copy it out before starting the PostgreSQL
stack:

```bash
mkdir -p backups/pglite-export
docker run --rm \
  -v notemind_pglite_data:/data \
  -v "$PWD/backups/pglite-export:/export" \
  alpine sh -c "cp -a /data/. /export/"
```

Then, with PostgreSQL reachable and `DATABASE_URL` pointing at it (the Compose
database is published on `127.0.0.1:5432`):

```bash
npm run db:migrate-pglite -- --source=./backups/pglite-export --dry-run
npm run db:migrate-pglite -- --source=./backups/pglite-export
```

The copy is transactional, skips rows that already exist by primary key, and
uses `--replace` only if you intentionally want to clear the target tables
first. Verify the counts printed by the script and by `npm run db:verify`
before removing the legacy volume.

---

## Security notes

- The image contains **no** `.env`, API keys, database password, or JWT secret.
  `.dockerignore` keeps them out of the build context.
- The database is not exposed on a public interface; Compose publishes it on
  `127.0.0.1` only. Use a firewall/HTTPS reverse proxy in front of port `3000`
  when deploying to a server.
- An explicit `JWT_SECRET` always wins. The auto-generated fallback is used only
  when none is supplied, and is written to `/app/secrets/.jwt_secret` with
  owner-only permissions (`umask 077`, then `chmod 600`).
- The app and database containers run with `no-new-privileges`; the app runs as
  the non-root `node` user. Do not run either with `--privileged` or mount the
  Docker socket into them.
- Backups contain password hashes, note content, and embeddings. Treat dump
  files and the `notemind_backups` volume as sensitive and encrypt them at rest.
- Rotate `POSTGRES_PASSWORD` and `JWT_SECRET` if either is ever exposed.

---

## Environment variables

`compose.yaml` reads `.env` via `env_file` and overrides `DATABASE_URL` so the
app reaches the database as `db:5432` inside the Compose network. `PORT` is
forced to `3000` and `AI_CACHE_DIR` points at the mounted cache volume.

| Variable | Required | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | yes | Password for the Compose database user. URL-safe characters only. |
| `POSTGRES_USER` | no | Database user (default `notemind`). |
| `POSTGRES_DB` | no | Database name (default `notemind`). |
| `POSTGRES_PORT` | no | Loopback host port for the database (default `5432`). |
| `DB_POOL_MAX` | no | Application connection pool size (default `10`). |
| `DATABASE_URL` | outside Compose | Connection string used by `npm run dev`, scripts, and tests. |
| `JWT_SECRET` | recommended | Token signing key. Generated and persisted when absent. |
| `GEMINI_API_KEY` | for RAG | Embeddings and answer generation. |
| `GROQ_API_KEY` | no | Optional fallback generation provider. |
| `AI_*`, `PDF_*` | no | RAG/OCR tuning knobs. |
| `APP_PORT` | no | Host port for the app (default `3000`). |

Tests derive `<database>_test` from `DATABASE_URL` and recreate it before every
run. They never touch the development database.

---

## Run without Compose

The app needs a reachable PostgreSQL 16 + pgvector server. On Docker Desktop,
`host.docker.internal` reaches a database running on the host:

```bash
docker build -t notemind:local .

docker run -d --name notemind-app \
  --init \
  -p 3000:3000 \
  --env-file .env \
  -e DATABASE_URL="postgresql://notemind:<password>@host.docker.internal:5432/notemind" \
  -e AI_CACHE_DIR=/app/.ai-cache \
  -v notemind_app_secrets:/app/secrets \
  -v notemind_ai_cache:/app/.ai-cache \
  -v notemind_backups:/app/backups \
  notemind:local
```

On Linux, add `--add-host=host.docker.internal:host-gateway` or attach the
container to the same Docker network as the database.

Running the image from Docker Desktop's **Run** button is not a supported
deployment: it does not provide `DATABASE_URL` or the Compose network. Use
`docker compose up` instead.

---

## Troubleshooting

### `POSTGRES_PASSWORD must be set in .env`

Compose refuses to start rather than create a database with a default password.
Add `POSTGRES_PASSWORD` to `.env` and re-run. If the database volume already
exists, changing the variable does not change the stored password; rotate it
inside PostgreSQL or recreate the volume (which deletes data).

### The app exits with `ECONNREFUSED` / `Failed to start server`

The API applies migrations at boot and exits if PostgreSQL is unreachable.
Check `docker compose ps` and `docker compose logs db`. The app is configured to
start only after the database health check passes, so a failure here usually
means the database crashed or the password/connection string changed.

### `Migration "..." has changed after it was applied`

The migration runner stores a SHA-256 checksum for every applied file. Never
edit an applied migration; add a new migration directory instead. This guard
prevents two instances from silently drifting apart.

### `The pgvector extension is required but could not be enabled`

Use the bundled `pgvector/pgvector:pg16` image (default) or a managed provider
that supports pgvector. The database user must be allowed to create the
extension.

### Port 3000 or 5432 is already in use

Choose another host port:

```bash
APP_PORT=8080 docker compose up -d
POSTGRES_PORT=55432 docker compose up -d
```

If you change `POSTGRES_PORT`, update the host-side `DATABASE_URL` used by
native tools as well.

### `database "notemind_test" does not exist` during tests

The test setup creates and recreates the database automatically. The configured
PostgreSQL user needs `CREATEDB`. The Compose `POSTGRES_USER` is a superuser, so
this works out of the box.

---

## What happens on first boot

1. `db` starts PostgreSQL 16 and enables the `vector` extension during
   migrations.
2. The app waits for `pg_isready` to report healthy.
3. `src/server.ts` connects through the pool, takes a PostgreSQL advisory lock,
   and applies every pending file in `prisma/migrations/`, recording its
   checksum in `schema_migrations`.
4. Express serves the compiled frontend from `/app/client/dist`.
5. The container reports healthy once `GET /health` confirms the database is
   reachable.

OCR works offline: `eng.traineddata` is bundled into the image and the
tesseract.js worker is configured to read it from `/app`.
