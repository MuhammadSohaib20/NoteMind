# syntax=docker/dockerfile:1.7

# =============================================================================
# NoteMind container image
#
# One image contains:
#   - the compiled Express API (dist/)
#   - the compiled React frontend (client/dist/), served by Express
#   - Prisma migration SQL used by the embedded PGlite database
#   - eng.traineddata for offline OCR
#
# The app uses PGlite (PostgreSQL compiled to WASM), so no external database
# container is required. Data lives in /app/.pglite-data (mount a volume).
# =============================================================================

# ---------- shared base (build stages need devDependencies) ----------
FROM node:24-bookworm-slim AS base
WORKDIR /app

# ---------- backend: install, compile, drop dev dependencies ----------
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY prisma ./prisma
RUN npm run build \
 && npm prune --omit=dev

# ---------- frontend: install and build the Vite bundle ----------
FROM base AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# ---------- runtime ----------
FROM node:24-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# The native canvas used by PDF rendering/OCR needs these shared libraries.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libstdc++6 \
      fontconfig \
      fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

# Production Node modules and compiled backend.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json ./

# Offline OCR language data (src/services/pdfOcr.ts loads /app/eng.traineddata).
COPY --chown=node:node eng.traineddata ./

# Express serves the SPA from /app/client/dist when it exists.
COPY --from=client-build --chown=node:node /app/client/dist ./client/dist

# Entrypoint: supplies a persisted fallback JWT_SECRET when none is injected
# (for example when the image is launched from Docker Desktop's Run button).
# sed normalises CRLF in case the build context came from a Windows checkout.
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/notemind-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/notemind-entrypoint.sh

# Writable locations: PGlite data, embedding cache, backup output.
RUN mkdir -p /app/.pglite-data /app/.ai-cache /app/backups \
 && chown -R node:node /app/.pglite-data /app/.ai-cache /app/backups

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/notemind-entrypoint.sh"]
CMD ["node", "dist/server.js"]
