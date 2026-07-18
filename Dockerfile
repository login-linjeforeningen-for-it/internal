FROM oven/bun:alpine AS base
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --production

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

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json

COPY public ./public
COPY src ./src
COPY types.d.ts tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=8001
ENV TZ=Europe/Oslo

EXPOSE 8001

CMD ["bun", "src/index.ts"]

