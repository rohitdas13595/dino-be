-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Asset Types
CREATE TABLE IF NOT EXISTS asset_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    code VARCHAR(10) UNIQUE NOT NULL
);

-- Wallets
CREATE TABLE IF NOT EXISTS wallets (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    asset_type_id INT REFERENCES asset_types(id),
    balance DECIMAL(20,2) NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CHECK (balance >= 0),
    UNIQUE(user_id, asset_type_id)
);

-- Transactions (Immutable Log)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    transaction_type VARCHAR(20) NOT NULL, -- TOP_UP, BONUS, SPEND
    user_id UUID NOT NULL,
    asset_type_id INT REFERENCES asset_types(id),
    amount DECIMAL(20,2) NOT NULL,
    status VARCHAR(20) NOT NULL, -- PENDING, COMPLETED, FAILED
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_transactions ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);

-- Ledger Entries (Double-Entry)
CREATE TABLE IF NOT EXISTS ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    transaction_id UUID REFERENCES transactions(id),
    wallet_id BIGINT REFERENCES wallets(id),
    entry_type VARCHAR(10) NOT NULL, -- DEBIT, CREDIT
    amount DECIMAL(20,2) NOT NULL,
    balance_after DECIMAL(20,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON ledger_entries(wallet_id);
