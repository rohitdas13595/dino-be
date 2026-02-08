import sql from "../db/index";
// @ts-ignore
import { Decimal } from "decimal.js";
import { logger } from "../utils/logger";
import { redis } from "../db/redis";

// System User ID per seed.sql
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export class InsufficientFundsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientFundsError";
  }
}

export class IdempotencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyError";
  }
}

export class WalletService {
  // Fetch asset details by name or code
  async getAssetType(identifier: string) {
    const cacheKey = `asset:${identifier}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await sql`
      SELECT * FROM asset_types 
      WHERE name = ${identifier} OR code = ${identifier}
    `;

    if (result[0]) {
      await redis.set(cacheKey, JSON.stringify(result[0]), "EX", 3600);
    }

    return result[0];
  }

  // Get wallet balance for a user and asset
  async getBalance(userId: string, assetTypeId: number) {
    const cacheKey = `balance:${userId}:${assetTypeId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const result = await sql`
      SELECT balance FROM wallets 
      WHERE user_id = ${userId} AND asset_type_id = ${assetTypeId}
    `;

    const balance = result[0]?.balance || "0";
    await redis.set(cacheKey, balance, "EX", 60); // Short cache for balance

    return balance;
  }

  // Get transaction history for a user
  async getTransactions(
    userId: string,
    limit: number = 20,
    offset: number = 0,
  ) {
    return await sql`
      SELECT t.*, a.code as asset_code
      FROM transactions t
      JOIN asset_types a ON t.asset_type_id = a.id
      WHERE t.user_id = ${userId}
      ORDER BY t.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  // Helper to generate a 64-bit integer from multiple strings (for advisory locks)
  private generateLockKey(...parts: string[]): bigint {
    const str = parts.sort().join("-");
    let hash = 0n;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5n) - hash + BigInt(str.charCodeAt(i));
    }
    // Return as a signed 64-bit integer (Postgres bigint)
    return BigInt.asIntN(64, hash);
  }

  // Core Transfer Logic
  private async transfer(
    fromUserId: string,
    toUserId: string,
    assetTypeId: number,
    amount: string | number | Decimal,
    transactionType: "TOP_UP" | "BONUS" | "SPEND",
    idempotencyKey: string,
    ownerId: string,
    metadata: any = {},
  ) {
    const amountDecimal = new Decimal(amount);
    if (amountDecimal.isNegative() || amountDecimal.isZero()) {
      throw new Error("Amount must be positive");
    }

    logger.debug(
      { fromUserId, toUserId, amount, transactionType, idempotencyKey },
      "Processing transfer",
    );

    const sortedUserIds = [fromUserId, toUserId].sort();
    const advisoryLockKey = this.generateLockKey(
      fromUserId,
      toUserId,
      assetTypeId.toString(),
    );

    return await sql.begin(async (tx: any) => {
      // 1. Set Lock Timeouts for this transaction
      await tx`SET LOCAL lock_timeout = '5s'`;
      await tx`SET LOCAL statement_timeout = '10s'`;

      // 2. Advisory Lock (Level 2 protection)
      await tx`SELECT pg_advisory_xact_lock(${advisoryLockKey})`;

      // 3. Double-Check Idempotency inside transaction
      const existingTx = await tx`
        SELECT * FROM transactions WHERE idempotency_key = ${idempotencyKey}
      `;

      if (existingTx.length > 0) {
        if (existingTx[0].status === "COMPLETED") {
          return existingTx[0];
        } else {
          throw new IdempotencyError(
            `Transaction previously processed with status: ${existingTx[0].status}`,
          );
        }
      }

      // 3. Ensure wallets exist (Auto-onboarding)
      for (const uid of sortedUserIds) {
        await tx`
          INSERT INTO wallets (user_id, asset_type_id, balance)
          VALUES (${uid}, ${assetTypeId}, 0)
          ON CONFLICT (user_id, asset_type_id) DO NOTHING
        `;
      }

      // 4. Row Lock Wallets (Level 1 protection)
      const wallets = await tx`
        SELECT * FROM wallets 
        WHERE user_id IN ${sql(sortedUserIds)}
        AND asset_type_id = ${assetTypeId}
        ORDER BY user_id ASC
        FOR UPDATE
      `;

      const sourceWallet = wallets.find((w: any) => w.user_id === fromUserId);
      const destWallet = wallets.find((w: any) => w.user_id === toUserId);

      if (!sourceWallet || !destWallet) {
        throw new Error(
          "Critical: Wallet should have been created but not found",
        );
      }

      // 5. Check Balance

      const sourceBalance = new Decimal(sourceWallet.balance);
      if (sourceBalance.lessThan(amountDecimal)) {
        logger.warn(
          {
            fromUserId,
            amount: amountDecimal.toString(),
            balance: sourceBalance.toString(),
          },
          "Insufficient funds",
        );
        throw new InsufficientFundsError(
          `Insufficient funds in source wallet (User: ${fromUserId})`,
        );
      }

      // 5. Create Transaction Record
      const [transaction] = await tx`
        INSERT INTO transactions (
          idempotency_key, transaction_type, user_id, asset_type_id, amount, status, metadata
        ) VALUES (
          ${idempotencyKey}, ${transactionType}, ${ownerId}, ${assetTypeId}, ${amountDecimal.toString()}, 'PENDING', ${metadata}
        )
        RETURNING id, created_at
      `;

      // 6. Update Balances & Create Ledger Entries
      const newSourceBalance = sourceBalance.minus(amountDecimal);
      const destBalance = new Decimal(destWallet.balance);
      const newDestBalance = destBalance.plus(amountDecimal);

      await tx`
        UPDATE wallets 
        SET balance = ${newSourceBalance.toString()}, version = version + 1, updated_at = NOW()
        WHERE id = ${sourceWallet.id}
      `;

      await tx`
        INSERT INTO ledger_entries (
          transaction_id, wallet_id, entry_type, amount, balance_after
        ) VALUES (
          ${transaction.id}, ${sourceWallet.id}, 'DEBIT', ${amountDecimal.toString()}, ${newSourceBalance.toString()}
        )
      `;

      await tx`
        UPDATE wallets 
        SET balance = ${newDestBalance.toString()}, version = version + 1, updated_at = NOW()
        WHERE id = ${destWallet.id}
      `;

      await tx`
        INSERT INTO ledger_entries (
          transaction_id, wallet_id, entry_type, amount, balance_after
        ) VALUES (
          ${transaction.id}, ${destWallet.id}, 'CREDIT', ${amountDecimal.toString()}, ${newDestBalance.toString()}
        )
      `;

      // 7. Update Transaction Status
      const [finalTransaction] = await tx`
        UPDATE transactions 
        SET status = 'COMPLETED'
        WHERE id = ${transaction.id}
        RETURNING *
      `;

      // 8. Invalidate Caches
      await redis.del(`balance:${fromUserId}:${assetTypeId}`);
      await redis.del(`balance:${toUserId}:${assetTypeId}`);

      logger.info(
        { transactionId: finalTransaction.id },
        "Transfer completed successfully",
      );
      return finalTransaction;
    });
  }

  // Wrapper for Top-Up (System -> User)
  async topUp(
    userId: string,
    assetCode: string,
    amount: string | number,
    idempotencyKey: string,
  ) {
    const asset = await this.getAssetType(assetCode);
    if (!asset) throw new Error(`Invalid asset code: ${assetCode}`);

    return this.transfer(
      SYSTEM_USER_ID,
      userId,
      asset.id,
      amount,
      "TOP_UP",
      idempotencyKey,
      userId,
    );
  }

  // Wrapper for Bonus (System -> User)
  async grantBonus(
    userId: string,
    assetCode: string,
    amount: string | number,
    idempotencyKey: string,
  ) {
    const asset = await this.getAssetType(assetCode);
    if (!asset) throw new Error(`Invalid asset code: ${assetCode}`);

    return this.transfer(
      SYSTEM_USER_ID,
      userId,
      asset.id,
      amount,
      "BONUS",
      idempotencyKey,
      userId,
    );
  }

  // Wrapper for Spend (User -> System)
  async spend(
    userId: string,
    assetCode: string,
    amount: string | number,
    idempotencyKey: string,
  ) {
    const asset = await this.getAssetType(assetCode);
    if (!asset) throw new Error(`Invalid asset code: ${assetCode}`);

    return this.transfer(
      userId,
      SYSTEM_USER_ID,
      asset.id,
      amount,
      "SPEND",
      idempotencyKey,
      userId,
    );
  }
}
