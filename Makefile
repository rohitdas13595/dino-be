.PHONY: help install dev build test clean docker-up docker-down docker-logs db-reset lint format check

# Default target
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Installation
install: ## Install dependencies
	bun install

# Development
dev: ## Start development server with hot reload
	bun run dev

build: ## Build the application
	bun build src/index.ts --outdir dist --target bun

# Testing
test: ## Run all tests
	bun test

test-unit: ## Run unit tests only
	bun test tests/unit

test-integration: ## Run integration tests only
	bun test tests/integration

test-concurrency: ## Run concurrency tests only
	bun test tests/concurrency

test-ledger: ## Run ledger tests only
	bun test tests/ledger

test-watch: ## Run tests in watch mode
	bun test --watch

test-coverage: ## Run tests with coverage report
	bun test --coverage

# Docker commands
docker-up: ## Start all services (dev)
	docker-compose up -d

docker-up-prod: ## Start all services (production)
	docker-compose -f docker-compose.prod.yml up -d

docker-down: ## Stop all services
	docker-compose down

docker-down-prod: ## Stop production services
	docker-compose -f docker-compose.prod.yml down

docker-logs: ## View logs from all services
	docker-compose logs -f

docker-logs-db: ## View database logs only
	docker-compose logs -f db

docker-logs-app: ## View application logs (production)
	docker-compose -f docker-compose.prod.yml logs -f app

docker-ps: ## Show running containers
	docker-compose ps

docker-restart: ## Restart all services
	docker-compose restart

docker-build: ## Build docker images
	docker-compose build

docker-build-prod: ## Build production docker images
	docker-compose -f docker-compose.prod.yml build

# Database commands
db-shell: ## Open PostgreSQL shell
	docker-compose exec db psql -U dino_user -d dino_wallet

db-reset: ## Reset database (drop and recreate)
	docker-compose down -v
	docker-compose up -d db
	@echo "Waiting for database to be ready..."
	@sleep 5
	@echo "Database reset complete!"

db-backup: ## Backup database to file
	docker-compose exec -T db pg_dump -U dino_user dino_wallet > backup_$$(date +%Y%m%d_%H%M%S).sql

db-restore: ## Restore database from backup (usage: make db-restore FILE=backup.sql)
	docker-compose exec -T db psql -U dino_user dino_wallet < $(FILE)

# Code quality
lint: ## Run linter
	@echo "Linting TypeScript files..."
	@bunx tsc --noEmit

format: ## Format code
	@echo "Formatting code..."
	@bunx prettier --write "src/**/*.ts" "tests/**/*.ts"

check: lint test ## Run linter and tests

# Cleaning
clean: ## Clean generated files and containers
	rm -rf dist coverage
	docker-compose down -v

clean-all: clean ## Clean everything including node_modules
	rm -rf node_modules

# Utility commands
logs: ## View application logs (dev)
	tail -f logs/*.log 2>/dev/null || echo "No log files found"

swagger: ## Open Swagger UI in browser
	@echo "Opening Swagger UI at http://localhost:3000/swagger"
	@open http://localhost:3000/swagger || xdg-open http://localhost:3000/swagger || echo "Please open http://localhost:3000/swagger manually"

api-doc: ## View OpenAPI spec
	curl http://localhost:3000/doc | jq .

# Setup commands
setup: install docker-up ## Initial project setup
	@echo "Setup complete! Run 'make dev' to start development"

setup-prod: docker-up-prod ## Setup production environment
	@echo "Production environment started!"

# Health checks
health: ## Check if services are healthy
	@echo "Checking database..."
	@docker-compose exec db pg_isready -U dino_user || echo "Database not ready"
	@echo "Checking API..."
	@curl -s http://localhost:3000/ || echo "API not responding"

status: ## Show status of all services
	@echo "Docker containers:"
	@docker-compose ps
	@echo ""
	@echo "Database connection:"
	@docker-compose exec db pg_isready -U dino_user && echo "✓ Database is ready" || echo "✗ Database not ready"

# Performance testing
load-test: ## Run load tests (requires k6)
	@if command -v k6 >/dev/null 2>&1; then \
		k6 run tests/performance/load.k6.js; \
	else \
		echo "k6 not installed. Install from https://k6.io"; \
	fi


# Quick commands
quick-test: docker-up ## Quick test - start db and run tests
	@sleep 3
	bun test

quick-start: docker-up dev ## Quick start - start services and run dev server
