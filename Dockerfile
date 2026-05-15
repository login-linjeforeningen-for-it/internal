FROM oven/bun:alpine AS base
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --production

FROM oven/bun:alpine
WORKDIR /app

RUN apk add --no-cache \
    docker-cli \
    docker-cli-compose \
    git \
    age \
    lm-sensors \
    procps

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

