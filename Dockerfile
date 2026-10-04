FROM oven/bun:1-slim

WORKDIR /app

# Install system dependencies if required for canvas font rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY src ./src

ENV PORT=8081
EXPOSE 8081

CMD ["bun", "run", "src/server.ts"]
