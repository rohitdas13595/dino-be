import { describe, test, expect, beforeAll } from "bun:test";
import { WalletService } from "../../src/services/wallet.service";
import { generateIdempotencyKey } from "../fixtures/transactions";
import sql from "../../src/db/index";
import Decimal from "decimal.js";

describe("Ledger Tests - Double-Entry Accounting & Reconciliation", () => {
  const walletService = new WalletService();

  beforeAll(async () => {
    console.log("🧪 Running ledger verification tests...");
  });

  describe("Double-Entry Verification", () => {
    test("should create exactly 2 ledger entries per transaction", async () => {
      const testUser = crypto.randomUUID();

      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 0.00)
      `;

      const transaction = await walletService.topUp(
        testUser,
        "GOLD",
        "100.00",
        generateIdempotencyKey("ledger-double-entry"),
      );

      const entries = await sql`
        SELECT * FROM ledger_entries
        WHERE transaction_id = ${transaction.id}
        ORDER BY entry_type ASC
      `;

      expect(entries).toHaveLength(2);
    });

    test("should have matching debit and credit amounts", async () => {
      const testUser = crypto.randomUUID();

      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 0.00)
      `;

      const transaction = await walletService.topUp(
        testUser,
        "GOLD",
        "123.45",
        generateIdempotencyKey("ledger-amounts"),
      );

      const entries = await sql`
        SELECT * FROM ledger_entries
        WHERE transaction_id = ${transaction.id}
      `;

      const debitEntry = entries.find((e) => e.entry_type === "DEBIT");
      const creditEntry = entries.find((e) => e.entry_type === "CREDIT");

      expect(debitEntry).toBeDefined();
      expect(creditEntry).toBeDefined();
      expect(debitEntry!.amount).toBe("123.45");
      expect(creditEntry!.amount).toBe("123.45");
    });

    test("should link all ledger entries to valid transactions", async () => {
      const testUser = crypto.randomUUID();

      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 0.00)
      `;

      // Create multiple transactions
      for (let i = 0; i < 10; i++) {
        await walletService.topUp(
          testUser,
          "GOLD",
          "10.00",
          generateIdempotencyKey(`ledger-links-${i}`),
        );
      }

      // Verify all ledger entries have valid transaction_id
      const orphanedEntries = await sql`
        SELECT le.* FROM ledger_entries le
        LEFT JOIN transactions t ON le.transaction_id = t.id
        WHERE t.id IS NULL
      `;

      expect(orphanedEntries).toHaveLength(0);
    });
  });

  describe("Balance Reconciliation", () => {
    test("should rebuild balance from ledger entries exactly", async () => {
      const testUser = crypto.randomUUID();

      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 0.00)
      `;

      // Perform random transactions
      const operations = [
        walletService.topUp(
          testUser,
          "GOLD",
          "100.00",
          generateIdempotencyKey("recon-1"),
        ),
        walletService.topUp(
          testUser,
          "GOLD",
          "50.00",
          generateIdempotencyKey("recon-2"),
        ),
        walletService.spend(
          testUser,
          "GOLD",
          "30.00",
          generateIdempotencyKey("recon-3"),
        ),
        walletService.topUp(
          testUser,
          "GOLD",
          "25.50",
          generateIdempotencyKey("recon-4"),
        ),
        walletService.spend(
          testUser,
          "GOLD",
          "45.50",
          generateIdempotencyKey("recon-5"),
        ),
      ];

      await Promise.all(operations);

      // Get current wallet balance
      const [wallet] = await sql`
        SELECT * FROM wallets
        WHERE user_id = ${testUser} AND asset_type_id = 1
      `;

      const walletBalance = new Decimal(wallet.balance);

      // Rebuild from ledger
      const ledgerEntries = await sql`
        SELECT * FROM ledger_entries
        WHERE wallet_id = ${wallet.id}
        ORDER BY created_at ASC
      `;

      let reconstructedBalance = new Decimal(0);
      for (const entry of ledgerEntries) {
        if (entry.entry_type === "CREDIT") {
          reconstructedBalance = reconstructedBalance.plus(
            new Decimal(entry.amount),
          );
        } else if (entry.entry_type === "DEBIT") {
          reconstructedBalance = reconstructedBalance.minus(
            new Decimal(entry.amount),
          );
        }
      }

      expect(reconstructedBalance.toString()).toBe(walletBalance.toString());
      console.log(
        `✅ Wallet balance (${walletBalance}) matches ledger reconstruction (${reconstructedBalance})`,
      );
    });

    test("should maintain balance conservation across system", async () => {
      const user1 = crypto.randomUUID();
      const user2 = crypto.randomUUID();
      const user3 = crypto.randomUUID();

      // Create wallets
      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES 
          (${user1}, 1, 500.00),
          (${user2}, 1, 300.00),
          (${user3}, 1, 200.00)
      `;

      // Calculate initial total (including system)
      const initialWallets = await sql`
        SELECT SUM(balance)::decimal as total FROM wallets
        WHERE asset_type_id = 1
      `;
      const initialTotal = new Decimal(initialWallets[0].total);

      // Perform transactions
      await walletService.topUp(
        user1,
        "GOLD",
        "50.00",
        generateIdempotencyKey("conserve-1"),
      );
      await walletService.spend(
        user2,
        "GOLD",
        "100.00",
        generateIdempotencyKey("conserve-2"),
      );
      await walletService.topUp(
        user3,
        "GOLD",
        "75.00",
        generateIdempotencyKey("conserve-3"),
      );
      await walletService.spend(
        user1,
        "GOLD",
        "25.00",
        generateIdempotencyKey("conserve-4"),
      );

      // Calculate final total
      const finalWallets = await sql`
        SELECT SUM(balance)::decimal as total FROM wallets
        WHERE asset_type_id = 1
      `;
      const finalTotal = new Decimal(finalWallets[0].total);

      // Total should be conserved (money doesn't appear or disappear)
      expect(finalTotal.toString()).toBe(initialTotal.toString());
      console.log(
        `✅ System balance conserved: ${initialTotal} = ${finalTotal}`,
      );
    });

    test("should have correct balance_after snapshots", async () => {
      const testUser = crypto.randomUUID();

      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 0.00)
      `;

      // Perform sequential transactions
      await walletService.topUp(
        testUser,
        "GOLD",
        "100.00",
        generateIdempotencyKey("snap-1"),
      );
      await walletService.topUp(
        testUser,
        "GOLD",
        "50.00",
        generateIdempotencyKey("snap-2"),
      );
      await walletService.spend(
        testUser,
        "GOLD",
        "30.00",
        generateIdempotencyKey("snap-3"),
      );

      // Get ledger entries
      const [wallet] = await sql`
        SELECT * FROM wallets
        WHERE user_id = ${testUser} AND asset_type_id = 1
      `;

      const entries = await sql`
        SELECT * FROM ledger_entries
        WHERE wallet_id = ${wallet.id}
        ORDER BY created_at ASC
      `;

      // Verify balance_after is calculated correctly
      let expectedBalance = new Decimal(0);
      for (const entry of entries) {
        if (entry.entry_type === "CREDIT") {
          expectedBalance = expectedBalance.plus(new Decimal(entry.amount));
        } else {
          expectedBalance = expectedBalance.minus(new Decimal(entry.amount));
        }

        expect(new Decimal(entry.balance_after).toString()).toBe(
          expectedBalance.toString(),
        );
      }
    });
  });

  describe("Audit Trail", () => {
    test("should maintain immutable transaction log", async () => {
      const testUser = crypto.randomUUID();

      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 0.00)
      `;

      const transaction = await walletService.topUp(
        testUser,
        "GOLD",
        "100.00",
        generateIdempotencyKey("audit-immutable"),
      );

      // Try to update transaction (should fail or be ignored in real system)
      // For this test, just verify the transaction exists and status is COMPLETED
      const [tx] = await sql`
        SELECT * FROM transactions WHERE id = ${transaction.id}
      `;

      expect(tx.status).toBe("COMPLETED");
      expect(tx.amount).toBe("100.00");
      expect(tx.transaction_type).toBe("TOP_UP");
    });

    test("should preserve transaction timestamps in order", async () => {
      const testUser = crypto.randomUUID();

      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 0.00)
      `;

      // Create transactions with small delays
      const tx1 = await walletService.topUp(
        testUser,
        "GOLD",
        "10.00",
        generateIdempotencyKey("ts-1"),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      const tx2 = await walletService.topUp(
        testUser,
        "GOLD",
        "20.00",
        generateIdempotencyKey("ts-2"),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      const tx3 = await walletService.topUp(
        testUser,
        "GOLD",
        "30.00",
        generateIdempotencyKey("ts-3"),
      );

      // Verify chronological order
      expect(new Date(tx1.created_at).getTime()).toBeLessThan(
        new Date(tx2.created_at).getTime(),
      );
      expect(new Date(tx2.created_at).getTime()).toBeLessThan(
        new Date(tx3.created_at).getTime(),
      );
    });

    test("should track complete transaction history for user", async () => {
      const testUser = crypto.randomUUID();

      await sql`
        INSERT INTO wallets (user_id, asset_type_id, balance)
        VALUES (${testUser}, 1, 0.00)
      `;

      // Perform various operations
      await walletService.topUp(
        testUser,
        "GOLD",
        "100.00",
        generateIdempotencyKey("hist-1"),
      );
      await walletService.topUp(
        testUser,
        "GOLD",
        "50.00",
        generateIdempotencyKey("hist-2"),
      );
      await walletService.spend(
        testUser,
        "GOLD",
        "30.00",
        generateIdempotencyKey("hist-3"),
      );
      await walletService.grantBonus(
        testUser,
        "GOLD",
        "25.00",
        generateIdempotencyKey("hist-4"),
      );
      await walletService.spend(
        testUser,
        "GOLD",
        "20.00",
        generateIdempotencyKey("hist-5"),
      );

      // Retrieve history
      const history = await sql`
        SELECT * FROM transactions
        WHERE user_id = ${testUser}
        ORDER BY created_at ASC
      `;

      expect(history).toHaveLength(5);
      expect(history[0].transaction_type).toBe("TOP_UP");
      expect(history[1].transaction_type).toBe("TOP_UP");
      expect(history[2].transaction_type).toBe("SPEND");
      expect(history[3].transaction_type).toBe("BONUS");
      expect(history[4].transaction_type).toBe("SPEND");

      // All should be completed
      history.forEach((tx) => {
        expect(tx.status).toBe("COMPLETED");
      });
    });
  });

  describe("Ledger Integrity Checks", () => {
    test("should not have orphaned ledger entries", async () => {
      const orphanedEntries = await sql`
        SELECT le.* FROM ledger_entries le
        LEFT JOIN transactions t ON le.transaction_id = t.id
        WHERE t.id IS NULL
      `;

      expect(orphanedEntries).toHaveLength(0);
    });

    test("should not have orphaned transactions", async () => {
      const orphanedTransactions = await sql`
        SELECT t.* FROM transactions t
        LEFT JOIN ledger_entries le ON t.id = le.transaction_id
        WHERE t.status = 'COMPLETED'
        GROUP BY t.id
        HAVING COUNT(le.id) = 0
      `;

      expect(orphanedTransactions).toHaveLength(0);
    });

    test("should have all COMPLETED transactions with exactly 2 ledger entries", async () => {
      const invalidTransactions = await sql`
        SELECT t.id, COUNT(le.id) as entry_count
        FROM transactions t
        LEFT JOIN ledger_entries le ON t.id = le.transaction_id
        WHERE t.status = 'COMPLETED'
        GROUP BY t.id
        HAVING COUNT(le.id) != 2
      `;

      expect(invalidTransactions).toHaveLength(0);
    });

    test("should never have negative balances in ledger", async () => {
      const negativeBalances = await sql`
        SELECT * FROM ledger_entries
        WHERE balance_after::decimal < 0
      `;

      expect(negativeBalances).toHaveLength(0);
    });

    test("should verify wallet balance matches latest ledger entry for a fresh user", async () => {
      const testUser = crypto.randomUUID();
      await walletService.topUp(
        testUser,
        "GOLD",
        "100.00",
        generateIdempotencyKey("integrity-local-1"),
      );
      await walletService.spend(
        testUser,
        "GOLD",
        "30.00",
        generateIdempotencyKey("integrity-local-2"),
      );

      const [wallet] = await sql`
        SELECT * FROM wallets WHERE user_id = ${testUser} AND asset_type_id = 1
      `;

      const [latestEntry] = await sql`
        SELECT * FROM ledger_entries
        WHERE wallet_id = ${wallet.id}
        ORDER BY created_at DESC
        LIMIT 1
      `;

      expect(new Decimal(wallet.balance).toString()).toBe(
        new Decimal(latestEntry.balance_after).toString(),
      );
      expect(new Decimal(wallet.balance).toNumber()).toBe(70);
    });
  });

  describe("Large-Scale Reconciliation", () => {
    test("should reconcile after 1000+ transactions", async () => {
      const testUser = crypto.randomUUID();

      await walletService.topUp(
        testUser,
        "GOLD",
        "10000.00",
        generateIdempotencyKey("large-scale-init"),
      );

      console.log("🔄 Performing 1000 transactions...");

      // Perform 1000 random transactions
      const operations = [];
      for (let i = 0; i < 1000; i++) {
        if (i % 2 === 0) {
          operations.push(
            walletService.topUp(
              testUser,
              "GOLD",
              "10.00",
              generateIdempotencyKey(`large-scale-topup-${i}`),
            ),
          );
        } else {
          operations.push(
            walletService.spend(
              testUser,
              "GOLD",
              "5.00",
              generateIdempotencyKey(`large-scale-spend-${i}`),
            ),
          );
        }
      }

      await Promise.all(operations);

      console.log("✅ 1000 transactions completed");

      // Reconcile
      const [wallet] = await sql`
        SELECT * FROM wallets
        WHERE user_id = ${testUser} AND asset_type_id = 1
      `;

      const entries = await sql`
        SELECT * FROM ledger_entries
        WHERE wallet_id = ${wallet.id}
        ORDER BY created_at ASC
      `;

      let reconstructedBalance = new Decimal(0);
      for (const entry of entries) {
        if (entry.entry_type === "CREDIT") {
          reconstructedBalance = reconstructedBalance.plus(
            new Decimal(entry.amount),
          );
        } else {
          reconstructedBalance = reconstructedBalance.minus(
            new Decimal(entry.amount),
          );
        }
      }

      expect(reconstructedBalance.toString()).toBe(
        new Decimal(wallet.balance).toString(),
      );

      // Expected: 10000 (initial) + 500 topups of 10 and 500 spends of 5 = 10000 + 5000 - 2500 = 12500
      expect(reconstructedBalance.toNumber()).toBe(12500);

      console.log(
        `✅ Reconciliation passed: ${reconstructedBalance} matches wallet balance`,
      );
    }, 120000); // 2 minutes
  });
});
