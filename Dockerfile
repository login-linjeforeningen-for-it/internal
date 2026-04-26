FROM oven/bun:1.3.1-alpine

WORKDIR /app

RUN apk add --no-cache \
    docker-cli \
    docker-cli-compose \
    git \
    lm-sensors \
    openssh-client \
    procps

COPY package.json ./
RUN bun install --production

COPY public ./public
COPY src ./src
COPY types.d.ts tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=8001
ENV TZ=Europe/Oslo

EXPOSE 8001

CMD ["bun", "src/index.ts"]
