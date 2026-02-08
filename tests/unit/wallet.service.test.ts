import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  WalletService,
  InsufficientFundsError,
  IdempotencyError,
} from "../../src/services/wallet.service";
import {
  TEST_USER_1_ID,
  TEST_USER_2_ID,
  SYSTEM_USER_ID,
} from "../fixtures/users";
import { ASSET_CODES } from "../fixtures/assets";
import {
  generateIdempotencyKey,
  createTestTransaction,
} from "../fixtures/transactions";
import sql from "../../src/db/index";

describe("WalletService - Unit Tests", () => {
  const walletService = new WalletService();

  beforeAll(async () => {
    // Ensure database is seeded (assuming docker-compose is running)
    console.log("🧪 Setting up unit tests...");
  });

  afterAll(async () => {
    // Cleanup test data if needed
    // We avoid calling sql.end() here as it might close the shared connection
    // for other test files running in the same process.
  });

  describe("getAssetType()", () => {
    test("should retrieve asset by name", async () => {
      const asset = await walletService.getAssetType("Gold Coins");
      expect(asset).toBeDefined();
      expect(asset.name).toBe("Gold Coins");
      expect(asset.code).toBe("GOLD");
    });

    test("should retrieve asset by code", async () => {
      const asset = await walletService.getAssetType("GOLD");
      expect(asset).toBeDefined();
      expect(asset.name).toBe("Gold Coins");
      expect(asset.code).toBe("GOLD");
    });

    test("should return undefined for non-existent asset", async () => {
      const asset = await walletService.getAssetType("BITCOIN");
      expect(asset).toBeUndefined();
    });

    test("should be case-sensitive", async () => {
      const asset = await walletService.getAssetType("gold");
      expect(asset).toBeUndefined(); // lowercase "gold" shouldn't match "GOLD"
    });
  });

  describe("getBalance()", () => {
    test("should return correct balance for existing wallet", async () => {
      const asset = await walletService.getAssetType("GOLD");
      const balance = await walletService.getBalance(TEST_USER_1_ID, asset.id);

      // User 1 is seeded with 1000.00
      expect(balance).toBeDefined();
      expect(parseFloat(balance)).toBeGreaterThanOrEqual(0);
    });

    test("should return '0' for non-existent wallet", async () => {
      const asset = await walletService.getAssetType("GOLD");
      const nonExistentUser = crypto.randomUUID();
      const balance = await walletService.getBalance(nonExistentUser, asset.id);

      expect(balance).toBe("0");
    });

    test("should return decimal value as string", async () => {
      const asset = await walletService.getAssetType("GOLD");
      const balance = await walletService.getBalance(TEST_USER_1_ID, asset.id);

      expect(typeof balance).toBe("string");
    });

    test("should handle multiple asset types per user", async () => {
      const gold = await walletService.getAssetType("GOLD");
      const diamond = await walletService.getAssetType("DIAMOND");

      const goldBalance = await walletService.getBalance(
        TEST_USER_1_ID,
        gold.id,
      );
      const diamondBalance = await walletService.getBalance(
        TEST_USER_1_ID,
        diamond.id,
      );

      expect(goldBalance).toBeDefined();
      expect(diamondBalance).toBeDefined();
      // They can be different amounts
    });
  });

  describe("topUp()", () => {
    test("should credit user wallet from system", async () => {
      const idempotencyKey = generateIdempotencyKey("topup-credit");
      const asset = await walletService.getAssetType("GOLD");

      const balanceBefore = await walletService.getBalance(
        TEST_USER_1_ID,
        asset.id,
      );

      const result = await walletService.topUp(
        TEST_USER_1_ID,
        "GOLD",
        "50.00",
        idempotencyKey,
      );

      const balanceAfter = await walletService.getBalance(
        TEST_USER_1_ID,
        asset.id,
      );

      expect(result).toBeDefined();
      expect(result.status).toBe("COMPLETED");
      expect(parseFloat(balanceAfter)).toBe(parseFloat(balanceBefore) + 50);
    });

    test("should create transaction with status COMPLETED", async () => {
      const idempotencyKey = generateIdempotencyKey("topup-completed");

      const result = await walletService.topUp(
        TEST_USER_1_ID,
        "GOLD",
        "25.00",
        idempotencyKey,
      );

      expect(result.status).toBe("COMPLETED");
      expect(result.transaction_type).toBe("TOP_UP");
      expect(result.amount).toBe("25.00");
    });

    test("should create ledger entries (double-entry)", async () => {
      const idempotencyKey = generateIdempotencyKey("topup-ledger");

      const result = await walletService.topUp(
        TEST_USER_1_ID,
        "GOLD",
        "100.00",
        idempotencyKey,
      );

      // Verify ledger entries exist
      const entries = await sql`
        SELECT * FROM ledger_entries
        WHERE transaction_id = ${result.id}
        ORDER BY entry_type ASC
      `;

      expect(entries).toHaveLength(2);
      expect(entries[0].entry_type).toBe("CREDIT"); // User receives
      expect(entries[1].entry_type).toBe("DEBIT"); // System gives
      expect(entries[0].amount).toBe("100.00");
      expect(entries[1].amount).toBe("100.00");
    });

    test("should reject negative amounts", async () => {
      const idempotencyKey = generateIdempotencyKey("topup-negative");

      await expect(
        walletService.topUp(TEST_USER_1_ID, "GOLD", "-50.00", idempotencyKey),
      ).rejects.toThrow("Amount must be positive");
    });

    test("should reject zero amounts", async () => {
      const idempotencyKey = generateIdempotencyKey("topup-zero");

      await expect(
        walletService.topUp(TEST_USER_1_ID, "GOLD", "0", idempotencyKey),
      ).rejects.toThrow("Amount must be positive");
    });

    test("should reject invalid asset codes", async () => {
      const idempotencyKey = generateIdempotencyKey("topup-invalid-asset");

      await expect(
        walletService.topUp(TEST_USER_1_ID, "INVALID", "50.00", idempotencyKey),
      ).rejects.toThrow("Invalid asset code");
    });

    test("should handle decimal amounts correctly", async () => {
      const idempotencyKey = generateIdempotencyKey("topup-decimal");
      const asset = await walletService.getAssetType("GOLD");

      const balanceBefore = await walletService.getBalance(
        TEST_USER_1_ID,
        asset.id,
      );

      await walletService.topUp(
        TEST_USER_1_ID,
        "GOLD",
        "12.34",
        idempotencyKey,
      );

      const balanceAfter = await walletService.getBalance(
        TEST_USER_1_ID,
        asset.id,
      );

      expect(parseFloat(balanceAfter)).toBeCloseTo(
        parseFloat(balanceBefore) + 12.34,
        2,
      );
    });
  });

  describe("grantBonus()", () => {
    test("should credit user wallet from system", async () => {
      const idempotencyKey = generateIdempotencyKey("bonus-credit");
      const asset = await walletService.getAssetType("DIAMOND");

      const balanceBefore = await walletService.getBalance(
        TEST_USER_1_ID,
        asset.id,
      );

      await walletService.grantBonus(
        TEST_USER_1_ID,
        "DIAMOND",
        "75.00",
        idempotencyKey,
      );

      const balanceAfter = await walletService.getBalance(
        TEST_USER_1_ID,
        asset.id,
      );

      expect(parseFloat(balanceAfter)).toBe(parseFloat(balanceBefore) + 75);
    });

    test("should create transaction with type BONUS", async () => {
      const idempotencyKey = generateIdempotencyKey("bonus-type");

      const result = await walletService.grantBonus(
        TEST_USER_1_ID,
        "DIAMOND",
        "50.00",
        idempotencyKey,
      );

      expect(result.transaction_type).toBe("BONUS");
      expect(result.status).toBe("COMPLETED");
    });

    test("should follow double-entry accounting", async () => {
      const idempotencyKey = generateIdempotencyKey("bonus-double-entry");

      const result = await walletService.grantBonus(
        TEST_USER_1_ID,
        "DIAMOND",
        "100.00",
        idempotencyKey,
      );

      const entries = await sql`
        SELECT * FROM ledger_entries
        WHERE transaction_id = ${result.id}
      `;

      expect(entries).toHaveLength(2);
    });
  });

  describe("spend()", () => {
    test("should debit user wallet to system", async () => {
      // First top up to ensure balance
      const topupKey = generateIdempotencyKey("spend-setup");
      await walletService.topUp(TEST_USER_2_ID, "LOYALTY", "200.00", topupKey);

      const asset = await walletService.getAssetType("LOYALTY");
      const balanceBefore = await walletService.getBalance(
        TEST_USER_2_ID,
        asset.id,
      );

      const spendKey = generateIdempotencyKey("spend-debit");
      await walletService.spend(TEST_USER_2_ID, "LOYALTY", "50.00", spendKey);

      const balanceAfter = await walletService.getBalance(
        TEST_USER_2_ID,
        asset.id,
      );

      expect(parseFloat(balanceAfter)).toBe(parseFloat(balanceBefore) - 50);
    });

    test("should create transaction with type SPEND", async () => {
      const topupKey = generateIdempotencyKey("spend-type-setup");
      await walletService.topUp(TEST_USER_2_ID, "LOYALTY", "100.00", topupKey);

      const spendKey = generateIdempotencyKey("spend-type");
      const result = await walletService.spend(
        TEST_USER_2_ID,
        "LOYALTY",
        "30.00",
        spendKey,
      );

      expect(result.transaction_type).toBe("SPEND");
      expect(result.status).toBe("COMPLETED");
    });

    test("should throw InsufficientFundsError when balance < amount", async () => {
      const asset = await walletService.getAssetType("LOYALTY");
      const balance = await walletService.getBalance(TEST_USER_2_ID, asset.id);

      const overspendAmount = parseFloat(balance) + 1000;
      const idempotencyKey = generateIdempotencyKey("spend-insufficient");

      await expect(
        walletService.spend(
          TEST_USER_2_ID,
          "LOYALTY",
          overspendAmount.toString(),
          idempotencyKey,
        ),
      ).rejects.toThrow(InsufficientFundsError);
    });

    test("should allow spending entire balance (balance = 0)", async () => {
      // Setup: Create fresh user and give them exact amount
      const freshUser = crypto.randomUUID();

      // Create wallet first
      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${freshUser}, 1, 100.00)
      `;

      const asset = await walletService.getAssetType("GOLD");
      const balance = await walletService.getBalance(freshUser, asset.id);

      const idempotencyKey = generateIdempotencyKey("spend-all");
      await walletService.spend(freshUser, "GOLD", balance, idempotencyKey);

      const finalBalance = await walletService.getBalance(freshUser, asset.id);
      expect(parseFloat(finalBalance)).toBe(0);
    });

    test("should reject overspending", async () => {
      const freshUser = crypto.randomUUID();

      // Create wallet with 100
      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${freshUser}, 1, 100.00)
      `;

      const idempotencyKey = generateIdempotencyKey("spend-overspend");

      await expect(
        walletService.spend(freshUser, "GOLD", "100.01", idempotencyKey),
      ).rejects.toThrow(InsufficientFundsError);
    });
  });

  describe("Idempotency", () => {
    test("should return same result for duplicate idempotency key (COMPLETED)", async () => {
      const idempotencyKey = generateIdempotencyKey("idempotency-dup");

      const result1 = await walletService.topUp(
        TEST_USER_1_ID,
        "GOLD",
        "10.00",
        idempotencyKey,
      );
      const result2 = await walletService.topUp(
        TEST_USER_1_ID,
        "GOLD",
        "10.00",
        idempotencyKey,
      );

      expect(result1.id).toBe(result2.id);
      expect(result1.status).toBe("COMPLETED");
      expect(result2.status).toBe("COMPLETED");
    });

    test("should throw IdempotencyError for PENDING duplicate", async () => {
      // This is harder to test without simulating a stuck transaction
      // Would need to mock or create a PENDING transaction manually
      const idempotencyKey = generateIdempotencyKey("idempotency-pending");

      // Manually create a PENDING transaction
      await sql`
        INSERT INTO transactions (
          idempotency_key, transaction_type, user_id, asset_type_id, amount, status
        ) VALUES (
          ${idempotencyKey}, 'TOP_UP', ${TEST_USER_1_ID}, 1, 100.00, 'PENDING'
        )
      `;

      await expect(
        walletService.topUp(TEST_USER_1_ID, "GOLD", "100.00", idempotencyKey),
      ).rejects.toThrow(IdempotencyError);
    });

    test("should allow same amount with different idempotency key", async () => {
      const key1 = generateIdempotencyKey("amount-same-1");
      const key2 = generateIdempotencyKey("amount-same-2");

      const result1 = await walletService.topUp(
        TEST_USER_1_ID,
        "GOLD",
        "15.00",
        key1,
      );
      const result2 = await walletService.topUp(
        TEST_USER_1_ID,
        "GOLD",
        "15.00",
        key2,
      );

      expect(result1.id).not.toBe(result2.id);
      expect(result1.status).toBe("COMPLETED");
      expect(result2.status).toBe("COMPLETED");
    });
  });

  describe("Edge Cases", () => {
    test("should handle very small amounts (0.01)", async () => {
      const idempotencyKey = generateIdempotencyKey("edge-tiny");
      const asset = await walletService.getAssetType("GOLD");

      const balanceBefore = await walletService.getBalance(
        TEST_USER_1_ID,
        asset.id,
      );
      await walletService.topUp(TEST_USER_1_ID, "GOLD", "0.01", idempotencyKey);
      const balanceAfter = await walletService.getBalance(
        TEST_USER_1_ID,
        asset.id,
      );

      expect(parseFloat(balanceAfter)).toBeCloseTo(
        parseFloat(balanceBefore) + 0.01,
        2,
      );
    });

    test("should handle very large amounts", async () => {
      const idempotencyKey = generateIdempotencyKey("edge-huge");

      const result = await walletService.topUp(
        TEST_USER_1_ID,
        "GOLD",
        "999999.99",
        idempotencyKey,
      );

      expect(result.status).toBe("COMPLETED");
      expect(result.amount).toBe("999999.99");
    });

    test("should handle amount as string", async () => {
      const idempotencyKey = generateIdempotencyKey("edge-string");

      const result = await walletService.topUp(
        TEST_USER_1_ID,
        "GOLD",
        "123.45",
        idempotencyKey,
      );

      expect(result.status).toBe("COMPLETED");
    });

    test("should handle amount as number", async () => {
      const idempotencyKey = generateIdempotencyKey("edge-number");

      const result = await walletService.topUp(
        TEST_USER_1_ID,
        "GOLD",
        67.89,
        idempotencyKey,
      );

      expect(result.status).toBe("COMPLETED");
    });
  });
});
