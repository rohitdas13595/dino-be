FROM oven/bun:1.1-alpine AS base
WORKDIR /usr/src/app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Expose port (Hono defaults to 3000)
EXPOSE 3000

# Start the application
CMD ["bun", "run", "src/index.ts"]
