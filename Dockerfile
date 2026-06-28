FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 nextjs
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts/team-migrate.mjs ./scripts/team-migrate.mjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
RUN mkdir -p /data/imagine-media && chown -R nextjs:nodejs /data/imagine-media
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
