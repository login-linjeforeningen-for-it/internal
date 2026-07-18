FROM oven/bun:alpine AS builder
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --production --frozen-lockfile

FROM oven/bun:alpine AS lint
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY types.d.ts tsconfig.json eslint.config.js ./
RUN bun run lint

FROM oven/bun:alpine
WORKDIR /app

RUN apk add --no-cache \
    docker-cli=28.3.3-r5 \
    docker-cli-compose=2.36.2-r5 \
    git=2.49.1-r0 \
    age=1.2.1-r10 \
    lm-sensors=3.6.0-r5 \
    procps-ng=4.0.4-r3

COPY --from=docker/scout-cli:latest /docker-scout /usr/local/lib/docker/cli-plugins/docker-scout

RUN addgroup -S app && adduser -S app -G app \
    && adduser app docker 2>/dev/null || true

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/package.json ./package.json

COPY --chown=app:app public ./public
COPY --chown=app:app src ./src
COPY --chown=app:app types.d.ts tsconfig.json ./

RUN chown app:app /app

ENV NODE_ENV=production
ENV PORT=8001
ENV TZ=Europe/Oslo

EXPOSE 8001

USER app
CMD ["bun", "src/index.ts"]
