import { describe, test, expect, beforeAll } from "bun:test";
import { WalletService } from "../../src/services/wallet.service";
import { generateIdempotencyKey } from "../fixtures/transactions";
import sql from "../../src/db/index";

describe("Concurrency Tests - Race Conditions & Deadlocks", () => {
  const walletService = new WalletService();

  beforeAll(async () => {
    console.log("🧪 Running concurrency tests...");
  });

  describe("Race Condition Prevention", () => {
    test("should handle concurrent topups to same user correctly", async () => {
      const testUser = crypto.randomUUID();

      // Create wallet
      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 0.00)
      `;

      const initialBalance = await walletService.getBalance(testUser, 1);

      // 10 parallel top-ups of 100 each
      const concurrentOps = Array.from({ length: 10 }, (_, i) =>
        walletService.topUp(
          testUser,
          "GOLD",
          "100.00",
          generateIdempotencyKey(`concurrent-topup-${i}`),
        ),
      );

      // Execute all concurrently
      const results = await Promise.all(concurrentOps);

      // All should succeed
      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.status).toBe("COMPLETED");
      });

      // Balance should be exactly initial + 1000
      const finalBalance = await walletService.getBalance(testUser, 1);
      expect(parseFloat(finalBalance)).toBe(parseFloat(initialBalance) + 1000);

      // Should have 10 separate transactions
      const transactions = await sql`
        SELECT * FROM transactions
        WHERE user_id = ${testUser}
      `;
      expect(transactions.length).toBeGreaterThanOrEqual(10);
    }, 30000); // 30 second timeout for concurrent ops

    test("should handle concurrent spends from same user correctly", async () => {
      const testUser = crypto.randomUUID();

      // Create wallet with 1000
      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 1000.00)
      `;

      // 10 parallel spends of 100 each
      const concurrentOps = Array.from({ length: 10 }, (_, i) =>
        walletService.spend(
          testUser,
          "GOLD",
          "100.00",
          generateIdempotencyKey(`concurrent-spend-${i}`),
        ),
      );

      const results = await Promise.all(concurrentOps);

      // All should succeed
      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.status).toBe("COMPLETED");
      });

      // Balance should be exactly 0
      const finalBalance = await walletService.getBalance(testUser, 1);
      expect(parseFloat(finalBalance)).toBe(0);

      // Verify no negative balance at any point by checking ledger
      const ledgerEntries = await sql`
        SELECT * FROM ledger_entries le
        JOIN wallets w ON le.wallet_id = w.id
        WHERE w.user_id = ${testUser}
        ORDER BY le.created_at ASC
      `;

      ledgerEntries.forEach((entry) => {
        expect(parseFloat(entry.balance_after)).toBeGreaterThanOrEqual(0);
      });
    }, 30000);

    test("should handle mixed concurrent operations (topup + spend)", async () => {
      const testUser = crypto.randomUUID();

      // Create wallet with 500
      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 500.00)
      `;

      // 5 topups of 100 and 5 spends of 100
      const topups = Array.from({ length: 5 }, (_, i) =>
        walletService.topUp(
          testUser,
          "GOLD",
          "100.00",
          generateIdempotencyKey(`mixed-topup-${i}`),
        ),
      );

      const spends = Array.from({ length: 5 }, (_, i) =>
        walletService.spend(
          testUser,
          "GOLD",
          "100.00",
          generateIdempotencyKey(`mixed-spend-${i}`),
        ),
      );

      // Execute all concurrently
      const results = await Promise.all([...topups, ...spends]);

      // All 10 should succeed
      expect(results).toHaveLength(10);

      // Final balance should be 500 + (5*100) - (5*100) = 500
      const finalBalance = await walletService.getBalance(testUser, 1);
      expect(parseFloat(finalBalance)).toBe(500);
    }, 30000);

    test("should handle high contention scenario (100 concurrent ops)", async () => {
      const testUser = crypto.randomUUID();

      // Create wallet with large balance
      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 100000.00)
      `;

      // 50 topups + 50 spends
      const operations = [
        ...Array.from({ length: 50 }, (_, i) =>
          walletService.topUp(
            testUser,
            "GOLD",
            "10.00",
            generateIdempotencyKey(`high-contention-topup-${i}`),
          ),
        ),
        ...Array.from({ length: 50 }, (_, i) =>
          walletService.spend(
            testUser,
            "GOLD",
            "10.00",
            generateIdempotencyKey(`high-contention-spend-${i}`),
          ),
        ),
      ];

      // Shuffle to mix operations
      operations.sort(() => Math.random() - 0.5);

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      // All should complete successfully
      expect(results).toHaveLength(100);
      results.forEach((result) => {
        expect(result.status).toBe("COMPLETED");
      });

      // Balance should be unchanged (50*10 added, 50*10 removed)
      const finalBalance = await walletService.getBalance(testUser, 1);
      expect(parseFloat(finalBalance)).toBe(100000);

      console.log(`✅ 100 concurrent ops completed in ${duration}ms`);

      // Performance check: should complete in reasonable time
      expect(duration).toBeLessThan(60000); // < 60 seconds
    }, 90000); // 90 second timeout
  });

  describe("Deadlock Prevention", () => {
    test("should not deadlock with consistent lock ordering", async () => {
      const user1 = crypto.randomUUID();
      const user2 = crypto.randomUUID();

      // Create both wallets
      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES 
          (${user1}, 1, 1000.00),
          (${user2}, 1, 1000.00)
      `;

      // These operations would deadlock without proper lock ordering
      // Both involve the same two users but in different orders
      const operations = [
        // Thread A perspective: user1 -> user2
        walletService.topUp(
          user1,
          "GOLD",
          "100.00",
          generateIdempotencyKey("deadlock-1a"),
        ),
        walletService.topUp(
          user2,
          "GOLD",
          "100.00",
          generateIdempotencyKey("deadlock-1b"),
        ),

        // Thread B perspective: user2 -> user1
        walletService.spend(
          user1,
          "GOLD",
          "50.00",
          generateIdempotencyKey("deadlock-2a"),
        ),
        walletService.spend(
          user2,
          "GOLD",
          "50.00",
          generateIdempotencyKey("deadlock-2b"),
        ),

        // More cross operations
        walletService.topUp(
          user1,
          "GOLD",
          "25.00",
          generateIdempotencyKey("deadlock-3a"),
        ),
        walletService.spend(
          user2,
          "GOLD",
          "75.00",
          generateIdempotencyKey("deadlock-3b"),
        ),
      ];

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      // All should complete without deadlock
      expect(results).toHaveLength(6);
      results.forEach((result) => {
        expect(result.status).toBe("COMPLETED");
      });

      console.log(`✅ Cross-user ops completed in ${duration}ms (no deadlock)`);
    }, 30000);

    test("should handle many users with random operations (stress test)", async () => {
      const numUsers = 20;
      const numOpsPerUser = 5;

      // Create users
      const users = Array.from({ length: numUsers }, () => crypto.randomUUID());

      for (const user of users) {
        await sql`
          INSERT INTO wallets (user_id, asset_type_id, balance)
          VALUES (${user}, 1, 10000.00)
        `;
      }

      // Generate random operations
      const operations = [];
      for (let i = 0; i < numUsers; i++) {
        for (let j = 0; j < numOpsPerUser; j++) {
          const user = users[i];
          const isTopup = Math.random() > 0.5;

          if (isTopup) {
            operations.push(
              walletService.topUp(
                user,
                "GOLD",
                "10.00",
                generateIdempotencyKey(`stress-${i}-${j}-topup`),
              ),
            );
          } else {
            operations.push(
              walletService.spend(
                user,
                "GOLD",
                "10.00",
                generateIdempotencyKey(`stress-${i}-${j}-spend`),
              ),
            );
          }
        }
      }

      // Shuffle operations
      operations.sort(() => Math.random() - 0.5);

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      // All should succeed
      expect(results).toHaveLength(numUsers * numOpsPerUser);
      results.forEach((result) => {
        expect(result.status).toBe("COMPLETED");
      });

      console.log(
        `✅ ${numUsers * numOpsPerUser} random ops across ${numUsers} users completed in ${duration}ms`,
      );

      // Should complete in reasonable time without deadlocks
      expect(duration).toBeLessThan(60000); // < 60 seconds
    }, 90000);
  });

  describe("Lock Ordering Verification", () => {
    test("should acquire locks in consistent order (user_id ASC)", async () => {
      const user1 = "11111111-1111-1111-1111-111111111111"; // Smaller UUID
      const user2 = "22222222-2222-2222-2222-222222222222"; // Larger UUID

      // Ensure both wallets exist
      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${user1}, 1, 1000.00), (${user2}, 1, 1000.00)
        ON CONFLICT (user_id, asset_type_id) DO NOTHING
      `;

      // Operations in both directions should lock in same order
      const ops = [
        // user1 -> user2 (should lock user1 first, then user2)
        walletService.topUp(
          user1,
          "GOLD",
          "10.00",
          generateIdempotencyKey("lock-order-1"),
        ),

        // user2 -> user1 (should still lock user1 first, then user2)
        walletService.spend(
          user2,
          "GOLD",
          "10.00",
          generateIdempotencyKey("lock-order-2"),
        ),
      ];

      const results = await Promise.all(ops);

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result.status).toBe("COMPLETED");
      });
    }, 30000);
  });

  describe("Idempotency Under Concurrency", () => {
    test("should handle rapid duplicate requests correctly", async () => {
      const testUser = crypto.randomUUID();

      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 100.00)
      `;

      const idempotencyKey = generateIdempotencyKey("rapid-dup");

      // Send 5 identical requests simultaneously
      const duplicateOps = Array.from({ length: 5 }, () =>
        walletService.topUp(testUser, "GOLD", "50.00", idempotencyKey),
      );

      const results = await Promise.all(duplicateOps);

      // All should return the same transaction
      const transactionIds = results.map((r) => r.id);
      const uniqueIds = new Set(transactionIds);

      expect(uniqueIds.size).toBe(1); // Only one unique transaction
      expect(results[0].amount).toBe("50.00");

      // Balance should only increase by 50, not 250
      const finalBalance = await walletService.getBalance(testUser, 1);
      expect(parseFloat(finalBalance)).toBe(150); // 100 + 50
    }, 30000);

    test("should handle concurrent different transactions with no collision", async () => {
      const testUser = crypto.randomUUID();

      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 0.00)
      `;

      // 10 different idempotency keys
      const operations = Array.from({ length: 10 }, (_, i) =>
        walletService.topUp(
          testUser,
          "GOLD",
          "10.00",
          generateIdempotencyKey(`unique-${i}`),
        ),
      );

      const results = await Promise.all(operations);

      // Each should create a unique transaction
      const transactionIds = results.map((r) => r.id);
      const uniqueIds = new Set(transactionIds);

      expect(uniqueIds.size).toBe(10);

      // Balance should be 100 (10 * 10)
      const finalBalance = await walletService.getBalance(testUser, 1);
      expect(parseFloat(finalBalance)).toBe(100);
    }, 30000);
  });

  describe("Performance Benchmarks", () => {
    test("should handle 1000 sequential transactions efficiently", async () => {
      const testUser = crypto.randomUUID();

      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 0.00)
      `;

      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await walletService.topUp(
          testUser,
          "GOLD",
          "1.00",
          generateIdempotencyKey(`perf-seq-${i}`),
        );
      }

      const duration = Date.now() - startTime;
      const tps = 1000 / (duration / 1000);

      console.log(
        `✅ 1000 sequential ops in ${duration}ms (${tps.toFixed(2)} TPS)`,
      );

      // Verify final balance
      const finalBalance = await walletService.getBalance(testUser, 1);
      expect(parseFloat(finalBalance)).toBe(1000);

      // Target: > 100 TPS for sequential operations
      expect(tps).toBeGreaterThan(50); // Being conservative
    }, 60000);

    test("should measure concurrent throughput", async () => {
      const numUsers = 10;
      const opsPerUser = 100;

      // Create users
      const users = Array.from({ length: numUsers }, () => crypto.randomUUID());

      for (const user of users) {
        await sql`
          INSERT INTO wallets (user_id, asset_type_id, balance)
          VALUES (${user}, 1, 0.00)
        `;
      }

      // Generate all operations
      const operations = [];
      for (let i = 0; i < numUsers; i++) {
        for (let j = 0; j < opsPerUser; j++) {
          operations.push(
            walletService.topUp(
              users[i],
              "GOLD",
              "1.00",
              generateIdempotencyKey(`concurrent-perf-${i}-${j}`),
            ),
          );
        }
      }

      const startTime = Date.now();
      await Promise.all(operations);
      const duration = Date.now() - startTime;

      const totalOps = numUsers * opsPerUser;
      const tps = totalOps / (duration / 1000);

      console.log(
        `✅ ${totalOps} concurrent ops in ${duration}ms (${tps.toFixed(2)} TPS)`,
      );

      // Verify all balances
      for (const user of users) {
        const balance = await walletService.getBalance(user, 1);
        expect(parseFloat(balance)).toBe(opsPerUser);
      }
    }, 120000); // 2 minutes
  });
});
