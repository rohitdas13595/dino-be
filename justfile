# Default - show help
default:
    @just --list

# Install all dependencies
install:
    bun install

# Initial project setup (install + start services)
setup: install docker-up
    @echo "Setup complete! Run 'just dev' to start development"

# Setup production environment
setup-prod: docker-up-prod
    @echo "Production environment started!"

# Start development server with hot reload
dev:
    bun run dev

# Build the application for production
build:
    bun build src/index.ts --outdir dist --target bun

# Watch mode - restart on file changes
watch:
    bun run --watch src/index.ts

# Run all tests
test:
    bun test

# Run unit tests only
test-unit:
    bun test tests/unit

# Run integration tests
test-integration:
    bun test tests/integration

# Run concurrency tests
test-concurrency:
    bun test tests/concurrency

# Run ledger reconciliation tests
test-ledger:
    bun test tests/ledger

# Run tests in watch mode
test-watch:
    bun test --watch

# Run tests with coverage report
test-coverage:
    bun test --coverage

# Run specific test file
test-file FILE:
    bun test {{ FILE }}

# Quick test (start db if needed and run tests)
quick-test: docker-up
    @sleep 3
    bun test

# Start all services (development)
docker-up:
    docker-compose up -d

# Start all services (production)
docker-up-prod:
    docker-compose -f docker-compose.prod.yml up -d

# Start services and show logs
docker-up-logs:
    docker-compose up

# Stop all services
docker-down:
    docker-compose down

# Stop production services
docker-down-prod:
    docker-compose -f docker-compose.prod.yml down

# View logs from all services
docker-logs:
    docker-compose logs -f

# View database logs
docker-logs-db:
    docker-compose logs -f db

# View redis logs
docker-logs-redis:
    docker-compose logs -f redis

# View application logs (production)
docker-logs-app:
    docker-compose -f docker-compose.prod.yml logs -f app

# Show running containers
docker-ps:
    docker-compose ps

# Restart all services
docker-restart:
    docker-compose restart

# Build docker images
docker-build:
    docker-compose build

# Build production docker images
docker-build-prod:
    docker-compose -f docker-compose.prod.yml build --no-cache

# Rebuild and restart services
docker-rebuild: docker-down docker-build docker-up
    @echo "Services rebuilt and restarted"

# Open PostgreSQL shell
db-shell:
    docker-compose exec db psql -U dino_user -d dino_wallet

# Reset database (drop volumes and recreate)
db-reset:
    docker-compose down -v
    docker-compose up -d db
    @echo "Waiting for database to be ready..."
    @sleep 5
    @echo "Database reset complete!"

# Backup database to file
db-backup:
    #!/usr/bin/env bash
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    docker-compose exec -T db pg_dump -U dino_user dino_wallet > backup_${TIMESTAMP}.sql
    echo "Backup saved to backup_${TIMESTAMP}.sql"

# Restore database from backup
db-restore FILE:
    docker-compose exec -T db psql -U dino_user dino_wallet < {{ FILE }}
    @echo "Database restored from {{ FILE }}"

# Check database connection
db-check:
    docker-compose exec db pg_isready -U dino_user

# View database size
db-size:
    docker-compose exec db psql -U dino_user -d dino_wallet -c "SELECT pg_size_pretty(pg_database_size('dino_wallet'));"

# Show all tables
db-tables:
    docker-compose exec db psql -U dino_user -d dino_wallet -c "\dt"

# Count transactions
db-stats:
    #!/usr/bin/env bash
    echo "Database Statistics:"
    echo ""
    docker-compose exec db psql -U dino_user -d dino_wallet -c "SELECT 'Transactions' as table, COUNT(*) as count FROM transactions UNION ALL SELECT 'Ledger Entries', COUNT(*) FROM ledger_entries UNION ALL SELECT 'Wallets', COUNT(*) FROM wallets;"

# Run TypeScript type checking
lint:
    bunx tsc --noEmit

# Format code with prettier
format:
    bunx prettier --write "src/**/*.ts" "tests/**/*.ts"

# Check formatting without writing
format-check:
    bunx prettier --check "src/**/*.ts" "tests/**/*.ts"

# Run linter and tests
check: lint test

# Open Swagger UI in browser
swagger:
    @echo "🔗 Opening Swagger UI at http://localhost:3000/swagger"
    @open http://localhost:3000/swagger 2>/dev/null || xdg-open http://localhost:3000/swagger 2>/dev/null || echo "Please open http://localhost:3000/swagger manually"

# View OpenAPI spec (requires jq)
api-doc:
    curl -s http://localhost:3000/doc | jq .

# Check service health
health:
    #!/usr/bin/env bash
    echo "Health Check:"
    echo ""
    echo -n "Database: "
    docker-compose exec db pg_isready -U dino_user && echo "✅ Ready" || echo "❌ Not ready"
    echo -n "API: "
    curl -s http://localhost:3000/ >/dev/null && echo "✅ Ready" || echo "❌ Not ready"

# Show status of all services
status:
    @echo "Service Status:"
    @echo ""
    docker-compose ps
    @echo ""
    @just health

# Clean up
# ========

# Clean generated files
clean:
    rm -rf dist coverage

# Clean everything including node_modules
clean-all: clean
    rm -rf node_modules
    docker-compose down -v

# Clean docker volumes only
clean-volumes:
    docker-compose down -v

# Development Workflows
# =====================

# Quick start - start services and dev server
quick-start: docker-up
    @sleep 2
    @echo "Services started, launching dev server..."
    just dev

# Full rebuild - clean, install, and start everything
rebuild: clean install docker-rebuild
    @echo "Full rebuild complete!"

# Run pre-commit checks
pre-commit: format lint test
    @echo "Pre-commit checks passed!"

# Prepare for production deployment
prepare-prod: clean install test docker-build-prod
    @echo "Ready for production deployment!"

# Show recent database logs
db-recent-logs:
    docker-compose logs --tail=100 db

# Monitor database queries (requires pg_stat_statements)
db-monitor:
    docker-compose exec db psql -U dino_user -d dino_wallet -c "SELECT query, calls, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"

# Show active connections
db-connections:
    docker-compose exec db psql -U dino_user -d dino_wallet -c "SELECT count(*) as connections FROM pg_stat_activity;"

# Run load tests (requires k6)
load-test:
    #!/usr/bin/env bash
    if command -v k6 >/dev/null 2>&1; then
        k6 run tests/performance/load.k6.js

    else
        echo "k6 not installed. Install from https://k6.io"
    fi

# Benchmark API endpoints
benchmark:
    #!/usr/bin/env bash
    echo "Benchmarking API endpoints..."
    if command -v autocannon >/dev/null 2>&1; then
        autocannon -c 100 -d 10 http://localhost:3000/
    else
        echo "autocannon not installed. Run: npm install -g autocannon"
    fi

# Create a new migration file
new-migration NAME:
    @echo "Creating migration: {{ NAME }}"
    @touch "migrations/$(date +%Y%m%d%H%M%S)_{{ NAME }}.sql"
    @echo "Migration file created"

run-migration:
    bun run migrate:up

# Show project info
info:
    @echo "Dino Wallet Service"
    @echo ""
    @echo "Runtime: Bun $(bun --version)"
    @echo "Node Modules: $(find node_modules -maxdepth 0 -type d 2>/dev/null | wc -l) packages"
    @echo ""
    @echo "Services:"
    @docker-compose ps --format "table {{{{.Name}}\t{{{{.Status}}"
    @echo ""
    @echo "Endpoints:"
    @echo "  - API: http://localhost:3000"
    @echo "  - Swagger: http://localhost:3000/swagger"
    @echo "  - Docs: http://localhost:3000/doc"
    @echo "  - Database: localhost:5432"
    @echo "  - Redis: localhost:6379"

# Show all available recipes with descriptions
help:
    @just --list --unsorted
