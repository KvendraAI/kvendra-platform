# SPDX-License-Identifier: AGPL-3.0-only
# kvendra-platform — multi-stage Docker build (Node 20 Alpine).

# -----------------------------------------------------------------------------
# Stage 1 — deps: install ONLY production dependencies (no devDependencies).
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --legacy-peer-deps; \
    else \
      npm install --omit=dev --no-audit --no-fund --legacy-peer-deps; \
    fi

# -----------------------------------------------------------------------------
# Stage 2 — builder: install ALL deps + compile TypeScript.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
RUN if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps; \
    else \
      npm install --no-audit --no-fund --legacy-peer-deps; \
    fi
COPY src ./src
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3 — runtime: minimal image with compiled JS + prod deps + entrypoint.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app

# bash + openssl for entrypoint, postgresql-client for pg_isready.
RUN apk add --no-cache bash openssl postgresql-client

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh \
 && mkdir -p /data \
 && chown -R node:node /data /app

USER node

ENV NODE_ENV=production \
    PORT=7777 \
    HOST=0.0.0.0 \
    AUTH_TOKEN_FILE=/data/auth.token \
    LOG_LEVEL=info \
    STAGE=local

EXPOSE 7777
VOLUME ["/data"]

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
