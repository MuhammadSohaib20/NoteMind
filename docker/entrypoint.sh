#!/bin/sh
# NoteMind container entrypoint.
#
# JWT_SECRET is supplied by Compose through .env in the supported deployment.
# As a fallback for `docker run`/Docker Desktop launches without an env-file,
# generate a strong random secret and persist it in /app/secrets. Sessions then
# survive restarts when that directory is backed by a volume. (The app still
# requires DATABASE_URL pointing at a reachable PostgreSQL server.)
#
# An explicit JWT_SECRET always wins (docker compose with .env, --env-file,
# -e JWT_SECRET=..., or Docker Desktop's environment fields).

set -eu

if [ -z "${JWT_SECRET:-}" ]; then
  secret_file="${JWT_SECRET_FILE:-/app/secrets/.jwt_secret}"

  if [ -s "$secret_file" ]; then
    JWT_SECRET="$(cat "$secret_file")"
    if [ "${#JWT_SECRET}" -ge 32 ]; then
      export JWT_SECRET
      echo "[entrypoint] Loaded JWT_SECRET from $secret_file"
    else
      echo "[entrypoint] WARNING: $secret_file is shorter than 32 characters; generating a replacement." >&2
      JWT_SECRET=""
    fi
  fi

  if [ -z "${JWT_SECRET:-}" ]; then
    JWT_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))")"
    export JWT_SECRET

    # umask 077 makes the file owner-only from the moment it is created.
    if mkdir -p "$(dirname "$secret_file")" 2>/dev/null \
      && (umask 077 && printf '%s' "$JWT_SECRET" > "$secret_file") 2>/dev/null; then
      chmod 600 "$secret_file" 2>/dev/null || true
      echo "[entrypoint] JWT_SECRET was not provided."
      echo "[entrypoint] Generated a random secret and saved it to $secret_file"
      echo "[entrypoint] For production, set JWT_SECRET explicitly (or use docker compose with .env)."
    else
      echo "[entrypoint] WARNING: JWT_SECRET was not provided and could not be persisted." >&2
      echo "[entrypoint] A temporary secret is in use; sessions reset when the container restarts." >&2
    fi
  fi
elif [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "[entrypoint] WARNING: the provided JWT_SECRET is shorter than 32 characters." >&2
  echo "[entrypoint] Use a long random value in production." >&2
fi

exec "$@"
