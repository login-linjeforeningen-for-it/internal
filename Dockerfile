FROM oven/bun:1.3.1-alpine

WORKDIR /app

RUN apk add --no-cache \
    curl \
    docker-cli \
    docker-cli-compose \
    git \
    age \
    lm-sensors \
    npm \
    openssh-client \
    procps \
    unzip

RUN ARCH="$(uname -m)" \
    && case "$ARCH" in \
        x86_64) OP_ARCH=amd64 ;; \
        aarch64) OP_ARCH=arm64 ;; \
        *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac \
    && curl -fsSL "https://cache.agilebits.com/dist/1P/op2/pkg/v2.30.3/op_linux_${OP_ARCH}_v2.30.3.zip" -o /tmp/op.zip \
    && unzip -p /tmp/op.zip op > /usr/local/bin/op \
    && chmod +x /usr/local/bin/op \
    && rm -f /tmp/op.zip

ARG DOCKER_SCOUT_VERSION=latest

RUN ARCH="$(uname -m)" \
    && case "$ARCH" in \
        x86_64) SCOUT_ARCH=amd64 ;; \
        aarch64) SCOUT_ARCH=arm64 ;; \
        *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
    esac \
    && if [ "$DOCKER_SCOUT_VERSION" = "latest" ]; then \
        SCOUT_VERSION="$(curl -fsSL https://api.github.com/repos/docker/scout-cli/releases/latest \
            | sed -n 's/.*"tag_name": "v\([^"]*\)".*/\1/p' \
            | head -n 1)"; \
    else \
        SCOUT_VERSION="$DOCKER_SCOUT_VERSION"; \
    fi \
    && test -n "$SCOUT_VERSION" \
    && mkdir -p /root/.docker/cli-plugins \
    && curl -fsSL "https://github.com/docker/scout-cli/releases/download/v${SCOUT_VERSION}/docker-scout_${SCOUT_VERSION}_linux_${SCOUT_ARCH}.tar.gz" -o /tmp/docker-scout.tar.gz \
    && tar -xzf /tmp/docker-scout.tar.gz -C /tmp \
    && mv /tmp/docker-scout /root/.docker/cli-plugins/docker-scout \
    && chmod +x /root/.docker/cli-plugins/docker-scout \
    && /root/.docker/cli-plugins/docker-scout version \
    && rm -f /tmp/docker-scout.tar.gz

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
