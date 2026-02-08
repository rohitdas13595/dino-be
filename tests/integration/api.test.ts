import { describe, test, expect, beforeAll } from "bun:test";
import app from "../../src/index";
import { TEST_USER_1_ID, TEST_USER_2_ID } from "../fixtures/users";
import { ASSET_CODES } from "../fixtures/assets";
import { generateIdempotencyKey } from "../fixtures/transactions";

describe("Integration Tests - Wallet API Endpoints", () => {
  beforeAll(async () => {
    console.log("🧪 Running integration tests...");
  });

  describe("POST /wallet/topup", () => {
    test("should successfully top up user wallet", async () => {
      const req = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          assetCode: "GOLD",
          amount: "50.00",
          idempotencyKey: generateIdempotencyKey("api-topup"),
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("COMPLETED");
      expect(data.transaction_type).toBe("TOP_UP");
      expect(data.amount).toBe("50.00");
    });

    test("should return 400 for missing userId", async () => {
      const req = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetCode: "GOLD",
          amount: "50.00",
          idempotencyKey: generateIdempotencyKey(),
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });

    test("should return 400 for missing assetCode", async () => {
      const req = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          amount: "50.00",
          idempotencyKey: generateIdempotencyKey(),
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });

    test("should return 400 for missing amount", async () => {
      const req = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          assetCode: "GOLD",
          idempotencyKey: generateIdempotencyKey(),
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });

    test("should return 400 for missing idempotencyKey", async () => {
      const req = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          assetCode: "GOLD",
          amount: "50.00",
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });

    test("should return 400 for invalid assetCode", async () => {
      const req = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          assetCode: "INVALID",
          amount: "50.00",
          idempotencyKey: generateIdempotencyKey(),
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBeDefined();
    });

    test("should return 400 for negative amount", async () => {
      const req = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          assetCode: "GOLD",
          amount: "-50.00",
          idempotencyKey: generateIdempotencyKey(),
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("positive");
    });

    test("should return 400 for zero amount", async () => {
      const req = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          assetCode: "GOLD",
          amount: "0",
          idempotencyKey: generateIdempotencyKey(),
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("positive");
    });

    test("should return 409 for duplicate idempotency key", async () => {
      const idempotencyKey = generateIdempotencyKey("api-duplicate");

      // First request
      const req1 = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          assetCode: "GOLD",
          amount: "50.00",
          idempotencyKey,
        }),
      });

      const res1 = await app.fetch(req1);
      expect(res1.status).toBe(200);

      // Second request with same key - should return same result
      const req2 = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          assetCode: "GOLD",
          amount: "50.00",
          idempotencyKey,
        }),
      });

      const res2 = await app.fetch(req2);
      const data1 = await res1.json();
      const data2 = await res2.json();

      expect(res2.status).toBe(200);
      expect(data1.id).toBe(data2.id);
    });

    test("should handle large amounts", async () => {
      const req = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          assetCode: "GOLD",
          amount: "999999.99",
          idempotencyKey: generateIdempotencyKey(),
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);
    });

    test("should handle small amounts (0.01)", async () => {
      const req = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          assetCode: "GOLD",
          amount: "0.01",
          idempotencyKey: generateIdempotencyKey(),
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);
    });
  });

  describe("POST /wallet/bonus", () => {
    test("should successfully grant bonus", async () => {
      const req = new Request("http://localhost/wallet/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          assetCode: "DIAMOND",
          amount: "75.00",
          idempotencyKey: generateIdempotencyKey("api-bonus"),
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("COMPLETED");
      expect(data.transaction_type).toBe("BONUS");
      expect(data.amount).toBe("75.00");
    });

    test("should follow same validation as topup", async () => {
      const req = new Request("http://localhost/wallet/bonus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_1_ID,
          assetCode: "DIAMOND",
          amount: "-10.00",
          idempotencyKey: generateIdempotencyKey(),
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });
  });

  describe("POST /wallet/spend", () => {
    test("should successfully spend from wallet", async () => {
      // First top up
      const topupReq = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_2_ID,
          assetCode: "LOYALTY",
          amount: "200.00",
          idempotencyKey: generateIdempotencyKey("api-spend-setup"),
        }),
      });
      await app.fetch(topupReq);

      // Then spend
      const spendReq = new Request("http://localhost/wallet/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_2_ID,
          assetCode: "LOYALTY",
          amount: "50.00",
          idempotencyKey: generateIdempotencyKey("api-spend"),
        }),
      });

      const res = await app.fetch(spendReq);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("COMPLETED");
      expect(data.transaction_type).toBe("SPEND");
      expect(data.amount).toBe("50.00");
    });

    test("should return 402 for insufficient funds", async () => {
      const req = new Request("http://localhost/wallet/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: TEST_USER_2_ID,
          assetCode: "LOYALTY",
          amount: "999999999.00",
          idempotencyKey: generateIdempotencyKey("api-insufficient"),
        }),
      });

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(402);
      expect(data.error).toContain("Insufficient funds");
    });

    test("should allow spending entire balance", async () => {
      // Create fresh user wallet
      const freshUser = crypto.randomUUID();
      const setupKey = generateIdempotencyKey("api-spend-all-setup");

      // Setup with exact amount
      const setupReq = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: freshUser,
          assetCode: "GOLD",
          amount: "100.00",
          idempotencyKey: setupKey,
        }),
      });
      await app.fetch(setupReq);

      // Spend all
      const spendReq = new Request("http://localhost/wallet/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: freshUser,
          assetCode: "GOLD",
          amount: "100.00",
          idempotencyKey: generateIdempotencyKey("api-spend-all"),
        }),
      });

      const res = await app.fetch(spendReq);
      expect(res.status).toBe(200);

      // Verify balance is 0
      const balanceReq = new Request(
        `http://localhost/wallet/${freshUser}/balance?asset=GOLD`,
      );
      const balanceRes = await app.fetch(balanceReq);
      const balanceData = await balanceRes.json();

      expect(parseFloat(balanceData.balance)).toBe(0);
    });

    test("should reject overspending by 0.01", async () => {
      const freshUser = crypto.randomUUID();

      // Setup
      const setupReq = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: freshUser,
          assetCode: "DIAMOND",
          amount: "100.00",
          idempotencyKey: generateIdempotencyKey("api-overspend-setup"),
        }),
      });
      await app.fetch(setupReq);

      // Try to overspend
      const spendReq = new Request("http://localhost/wallet/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: freshUser,
          assetCode: "DIAMOND",
          amount: "100.01",
          idempotencyKey: generateIdempotencyKey("api-overspend"),
        }),
      });

      const res = await app.fetch(spendReq);
      expect(res.status).toBe(402);
    });
  });

  describe("GET /wallet/:userId/balance", () => {
    test("should return correct balance", async () => {
      const req = new Request(
        `http://localhost/wallet/${TEST_USER_1_ID}/balance?asset=GOLD`,
      );

      const res = await app.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.userId).toBe(TEST_USER_1_ID);
      expect(data.balance).toBeDefined();
      expect(typeof data.balance).toBe("string");
    });

    test("should require asset query parameter", async () => {
      const req = new Request(
        `http://localhost/wallet/${TEST_USER_1_ID}/balance`,
      );

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });

    test("should return 400 for invalid asset code", async () => {
      const req = new Request(
        `http://localhost/wallet/${TEST_USER_1_ID}/balance?asset=INVALID`,
      );

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
    });

    test("should return balance after transactions", async () => {
      const userId = crypto.randomUUID();

      // Top up
      const topupReq = new Request("http://localhost/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          assetCode: "LOYALTY",
          amount: "500.00",
          idempotencyKey: generateIdempotencyKey("balance-test-setup"),
        }),
      });
      await app.fetch(topupReq);

      // Check balance
      const balanceReq = new Request(
        `http://localhost/wallet/${userId}/balance?asset=LOYALTY`,
      );
      const balanceRes = await app.fetch(balanceReq);
      const data = await balanceRes.json();

      expect(parseFloat(data.balance)).toBe(500);
    });
  });

  describe("Swagger Documentation", () => {
    test("should render Swagger UI at /swagger", async () => {
      const req = new Request("http://localhost/swagger");
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("swagger");
    });

    test("should return OpenAPI spec at /doc", async () => {
      const req = new Request("http://localhost/doc");
      const res = await app.fetch(req);

      expect(res.status).toBe(200);
      const spec = await res.json();

      expect(spec.openapi).toBe("3.0.0");
      expect(spec.info.title).toBe("Wallet Service API");
      expect(spec.paths).toBeDefined();
    });

    test("should document all wallet endpoints", async () => {
      const req = new Request("http://localhost/doc");
      const res = await app.fetch(req);
      const spec = await res.json();

      expect(spec.paths["/wallet/topup"]).toBeDefined();
      expect(spec.paths["/wallet/bonus"]).toBeDefined();
      expect(spec.paths["/wallet/spend"]).toBeDefined();
      expect(spec.paths["/wallet/:userId/balance"]).toBeDefined();
    });
  });
});
