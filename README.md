# Dino Wallet Service

A high-performance, S-Tier financial microservice for managing virtual assets (Gold, Diamonds, Loyalty Points) with absolute precision. Built on **Bun**, **Hono**, and **PostgreSQL**.

Deployment: https://dino-be-production.up.railway.app
---

## Key Features

- **Double-Entry Ledger**: Mathematical integrity for every transaction with a full audit trail.
- **High Concurrency**: Handles concurrent race conditions and prevents deadlocks using multi-level locking (Row-level + Advisory locks).
- **Idempotency**: Bulletproof transaction handling with unique idempotency keys.
- **Real-time Performance**: Sub-10ms response times with Redis caching and Bun's high-performance runtime.
- **Self-Documenting**: Interactive API documentation via Swagger/OpenAPI.
- **Robust Testing**: 80+ tests including Unit, Integration, Concurrency, and Ledger Reconciliation.

---

## Quick Start

### 1. Prerequisites

- [Bun](https://bun.sh/)
- [Docker & Docker Compose](https://www.docker.com/)

### 2. Setup Environment

```bash
# Clone the repository
git clone <repo-url>
cd dino-be

# Copy example environment (or create .env)
cp .env.example .env
```

### 3. Spin up Infrastructure

```bash
make docker-up # Starts PostgreSQL and Redis
```

### 4. Run Migrations

```bash
bun run migrate:up
```

### 5. Start the Server

```bash
bun run dev
```

The service will be available at [http://localhost:3000](http://localhost:3000).

---

## Documentation

For deep technical dives, please refer to:

- **[Technical Guide (guide.md)](guide.md)**: Architecture, Diagrams (ERD, Sequence), and Strategy.
- **[Implementation Summary](IMPLEMENTATION_SUMMARY.md)**: Detailed report on design patterns and technical decisions.
- **[API Documentation](http://localhost:3000/swagger)**: (Active only when server is running).

---

## Commands Reference

| Task                 | Command                               |
| :------------------- | :------------------------------------ |
| **All Tests**        | `just test`                           |
| **Load Test**        | `just load-test`                      |
| **Coverage**         | `bun test --coverage`                 |
| **Migration Create** | `npm run migrate:create -- name`      |
| **Migration Up**     | `bun run migrate:up`                  |
| **Infrastructure**   | `make docker-up` / `make docker-down` |

---

## Core Technologies

- **Runtime**: Bun
- **Framework**: Hono (Zod OpenAPI)
- **Database**: PostgreSQL 17 (postgres.js)
- **Cache**: Redis (ioredis)
- **Logging**: Pino

---
