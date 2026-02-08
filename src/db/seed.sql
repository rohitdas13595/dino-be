-- Seed Data

-- 1. Asset Types
INSERT INTO asset_types (name, code) VALUES
('Gold Coins', 'GOLD'),
('Diamonds', 'DIAMOND'),
('Loyalty Points', 'LOYALTY')
ON CONFLICT (name) DO NOTHING;

-- 2. System Accounts (Treasury)
-- Let's assume a fixed UUID for system
-- System User ID: 00000000-0000-0000-0000-000000000000
INSERT INTO wallets (user_id, asset_type_id, balance)
SELECT '00000000-0000-0000-0000-000000000000'::uuid, id, 1000000000.00
FROM asset_types;

-- 3. User Accounts
-- User 1: 11111111-1111-1111-1111-111111111111
-- User 2: 22222222-2222-2222-2222-222222222222

-- User 1 Wallets
INSERT INTO wallets (user_id, asset_type_id, balance)
SELECT '11111111-1111-1111-1111-111111111111'::uuid, id, 1000.00
FROM asset_types
ON CONFLICT (user_id, asset_type_id) DO NOTHING;

-- User 2 Wallets
INSERT INTO wallets (user_id, asset_type_id, balance)
SELECT '22222222-2222-2222-2222-222222222222'::uuid, id, 500.00
FROM asset_types
ON CONFLICT (user_id, asset_type_id) DO NOTHING;
