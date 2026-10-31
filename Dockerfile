# syntax=docker/dockerfile:1
# Build on the target architecture so native sharp binaries match the runtime.
FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS builder
COPY . .
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3001
ARG NEXT_PUBLIC_BUILD_ID=docker-local
ENV DEPLOY_TARGET=docker \
    NODE_OPTIONS=--max-old-space-size=2048 \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_BUILD_ID=$NEXT_PUBLIC_BUILD_ID
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DEPLOY_TARGET=docker \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NODE_OPTIONS=--max-old-space-size=512
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# First-run content seeds a new volume. Existing volumes are never overwritten.
COPY --from=builder --chown=node:node /app/content/site-content.json ./content/site-content.json
COPY --from=builder --chown=node:node /app/content/intro-settings.json ./content/intro-settings.json
RUN mkdir -p .data .media/videos .next/cache public/images/uploads \
    public/images/proof-table public/images/textures public/fonts/uploads \
    && chown -R node:node .data .media .next content public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/version',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
