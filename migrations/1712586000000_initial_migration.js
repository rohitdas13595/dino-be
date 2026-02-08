/* eslint-disable camelcase */

export const shorthands = undefined;

export const up = (pgm) => {

  // 1. Extensions
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // 2. Tables
  pgm.createTable('asset_types', {
    id: 'id', // 'id' shorthand usually includes primary key
    name: { type: 'varchar(50)', notNull: true, unique: true },
    code: { type: 'varchar(10)', notNull: true, unique: true },
  });

  pgm.createTable('wallets', {
    id: { type: 'bigserial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true },
    asset_type_id: {
      type: 'integer',
      references: '"asset_types"',
      onDelete: 'CASCADE',
    },
    balance: { type: 'numeric(20,2)', notNull: true, default: 0 },
    version: { type: 'integer', notNull: true, default: 1 },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  pgm.addConstraint('wallets', 'wallets_balance_check', 'CHECK (balance >= 0)');
  pgm.addConstraint('wallets', 'wallets_user_id_asset_type_id_key', {
    unique: ['user_id', 'asset_type_id'],
  });

  pgm.createTable('transactions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    idempotency_key: { type: 'varchar(255)', notNull: true, unique: true },
    transaction_type: { type: 'varchar(20)', notNull: true },
    user_id: { type: 'uuid', notNull: true },
    asset_type_id: {
      type: 'integer',
      references: '"asset_types"',
      onDelete: 'CASCADE',
    },
    amount: { type: 'numeric(20,2)', notNull: true },
    status: { type: 'varchar(20)', notNull: true },
    metadata: { type: 'jsonb' },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    processed_at: { type: 'timestamp' },
  });

  pgm.createIndex('transactions', ['user_id', 'created_at']);
  pgm.createIndex('transactions', 'idempotency_key');

  pgm.createTable('ledger_entries', {
    id: { type: 'bigserial', primaryKey: true },
    transaction_id: {
      type: 'uuid',
      references: '"transactions"',
      onDelete: 'CASCADE',
    },
    wallet_id: {
      type: 'bigint',
      references: '"wallets"',
      onDelete: 'CASCADE',
    },
    entry_type: { type: 'varchar(10)', notNull: true },
    amount: { type: 'numeric(20,2)', notNull: true },
    balance_after: { type: 'numeric(20,2)', notNull: true },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  pgm.createIndex('ledger_entries', 'wallet_id');

  // 3. Seed Data
  pgm.sql(`
    INSERT INTO asset_types (name, code) VALUES
    ('Gold Coins', 'GOLD'),
    ('Diamonds', 'DIAMOND'),
    ('Loyalty Points', 'LOYALTY');

    INSERT INTO wallets (user_id, asset_type_id, balance)
    SELECT '00000000-0000-0000-0000-000000000000'::uuid, id, 1000000000.00
    FROM asset_types;

    INSERT INTO wallets (user_id, asset_type_id, balance)
    SELECT '11111111-1111-1111-1111-111111111111'::uuid, id, 1000.00
    FROM asset_types;

    INSERT INTO wallets (user_id, asset_type_id, balance)
    SELECT '22222222-2222-2222-2222-222222222222'::uuid, id, 500.00
    FROM asset_types;
  `);
};

export const down = (pgm) => {

  pgm.dropTable('ledger_entries');
  pgm.dropTable('transactions');
  pgm.dropTable('wallets');
  pgm.dropTable('asset_types');
};
