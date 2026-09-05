FROM oven/bun:1 AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` imports config/env.ts; the real value comes from Doppler at runtime.
ENV BETTER_AUTH_SECRET=build-time-placeholder-not-a-secret
RUN bun run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/config ./config
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts ./scripts
EXPOSE 8080
# start.mjs expands DOPPLER_SECRETS before handing over to server.js.
CMD ["node", "scripts/start.mjs"]
