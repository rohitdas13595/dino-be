import { Hono } from "hono";
import {
  WalletService,
  InsufficientFundsError,
  IdempotencyError,
} from "../services/wallet.service";
import { createRoute, z } from "@hono/zod-openapi";

import { OpenAPIHono } from "@hono/zod-openapi";

const walletRoutes = new OpenAPIHono();

const walletService = new WalletService();

walletRoutes.openapi(
  createRoute({
    method: "post",
    path: "/topup",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              userId: z.string().openapi("userId"),
              assetCode: z.string().openapi("assetCode"),
              amount: z.string().openapi("amount"),
              idempotencyKey: z.string().openapi("idempotencyKey"),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              userId: z.string(),
              assetCode: z.string(),
              amount: z.string(),
              balance: z.string(),
            }),
          },
        },
        description: "Successfully topped up wallet",
      },
      400: {
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: "Bad request",
      },
      409: {
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: "Idempotency conflict",
      },
    },
  }),
  async (c) => {
    const body = await c.req.json();
    const { userId, assetCode, amount, idempotencyKey } = body;

    try {
      const result = await walletService.topUp(
        userId,
        assetCode,
        amount,
        idempotencyKey,
      );
      return c.json(result);
    } catch (err: any) {
      if (err instanceof IdempotencyError) {
        // 409 Conflict logic or just return the existing success?
        // Service throws if pending or failed. If success, it returns result.
        return c.json({ error: err.message }, 409);
      }
      return c.json({ error: err.message }, 400);
    }
  },
);

walletRoutes.openapi(
  createRoute({
    method: "post",
    path: "/bonus",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              userId: z.string().openapi("userId"),
              assetCode: z.string().openapi("assetCode"),
              amount: z.string().openapi("amount"),
              idempotencyKey: z.string().openapi("idempotencyKey"),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              userId: z.string(),
              assetCode: z.string(),
              amount: z.string(),
              balance: z.string(),
            }),
          },
        },
        description: "Successfully granted bonus",
      },
      400: {
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: "Bad request",
      },
      409: {
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: "Idempotency conflict",
      },
    },
  }),
  async (c) => {
    const body = await c.req.json();
    const { userId, assetCode, amount, idempotencyKey } = body;

    try {
      const result = await walletService.grantBonus(
        userId,
        assetCode,
        amount,
        idempotencyKey,
      );
      return c.json(result);
    } catch (err: any) {
      if (err instanceof IdempotencyError) {
        return c.json({ error: err.message }, 409);
      }
      return c.json({ error: err.message }, 400);
    }
  },
);

walletRoutes.openapi(
  createRoute({
    method: "post",
    path: "/spend",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              userId: z.string().openapi("userId"),
              assetCode: z.string().openapi("assetCode"),
              amount: z.string().openapi("amount"),
              idempotencyKey: z.string().openapi("idempotencyKey"),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              userId: z.string(),
              assetCode: z.string(),
              amount: z.string(),
              balance: z.string(),
            }),
          },
        },
        description: "Successfully spent",
      },
      400: {
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: "Bad request",
      },
      402: {
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: "Insufficient funds",
      },
      409: {
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: "Idempotency conflict",
      },
    },
  }),
  async (c) => {
    const body = await c.req.json();
    const { userId, assetCode, amount, idempotencyKey } = body;

    try {
      const result = await walletService.spend(
        userId,
        assetCode,
        amount,
        idempotencyKey,
      );
      return c.json(result);
    } catch (err: any) {
      if (err instanceof InsufficientFundsError) {
        return c.json({ error: err.message }, 402); // Payment Required / Insufficient Funds
      }
      if (err instanceof IdempotencyError) {
        return c.json({ error: err.message }, 409);
      }
      return c.json({ error: err.message }, 400);
    }
  },
);

walletRoutes.openapi(
  createRoute({
    method: "get",
    path: "/:userId/balance",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              userId: z.string(),
              assetCode: z.string(),
              balance: z.string(),
            }),
          },
        },
        description: "Successfully retrieved balance",
      },
      400: {
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: "Bad request",
      },
    },
  }),
  async (c) => {
    const { userId } = c.req.param();
    const assetCode = c.req.query("asset");

    if (!assetCode) {
      return c.json(
        { error: "Asset code (query param ?asset=) is required" },
        400,
      );
    }

    const asset = await walletService.getAssetType(assetCode);
    if (!asset) return c.json({ error: "Invalid asset" }, 400);

    const balance = await walletService.getBalance(userId, asset.id);
    return c.json({ userId, assetCode, balance: balance.toString() }, 200);
  },
);

walletRoutes.openapi(
  createRoute({
    method: "get",
    path: "/:userId/transactions",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.array(
              z.object({
                id: z.string(),
                idempotency_key: z.string(),
                transaction_type: z.string(),
                user_id: z.string(),
                asset_type_id: z.number(),
                amount: z.string(),
                status: z.string(),
                created_at: z.string(),
                asset_code: z.string(),
              }),
            ),
          },
        },
        description: "Successfully retrieved transaction history",
      },
      400: {
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
        description: "Bad request",
      },
    },
  }),
  async (c) => {
    const { userId } = c.req.param();
    const limitParams = c.req.query("limit") || "20";
    const offsetParams = c.req.query("offset") || "0";
    const limit = parseInt(limitParams);
    const offset = parseInt(offsetParams);

    try {
      const transactions = await walletService.getTransactions(
        userId,
        limit,
        offset,
      );
      // Map to plain objects to satisfy type checking
      const results = transactions.map((t: any) => ({
        id: t.id,
        idempotency_key: t.idempotency_key,
        transaction_type: t.transaction_type,
        user_id: t.user_id,
        asset_type_id: t.asset_type_id,
        amount: t.amount.toString(), // Convert decimal to string
        status: t.status,
        created_at: t.created_at.toISOString(),
        asset_code: t.asset_code,
      }));
      return c.json(results, 200);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  },
);

export default walletRoutes;
