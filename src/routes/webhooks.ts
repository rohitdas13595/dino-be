import { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import {
  eventEmitter,
  WebhookSubscription,
  WalletEventType,
} from "../events/eventEmitter";

const webhookRoutes = new OpenAPIHono();

const eventTypeEnum = z.enum([
  "WALLET_TOPUP",
  "WALLET_BONUS",
  "WALLET_SPEND",
  "BALANCE_LOW",
  "TRANSACTION_FAILED",
]);

// Register webhook
webhookRoutes.openapi(
  createRoute({
    method: "post",
    path: "/register",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              url: z.string().url(),
              eventTypes: z.array(eventTypeEnum),
              secret: z.string().optional(),
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
              subscriptionId: z.string(),
              message: z.string(),
            }),
          },
        },
        description: "Webhook registered successfully",
      },
    },
  }),
  async (c) => {
    const body = await c.req.json();

    const subscription: WebhookSubscription = {
      id: crypto.randomUUID(),
      url: body.url,
      eventTypes: body.eventTypes as WalletEventType[],
      secret: body.secret,
      active: true,
      retryCount: 3,
      createdAt: new Date(),
    };

    eventEmitter.subscribe(subscription);

    return c.json({
      subscriptionId: subscription.id,
      message: "Webhook registered successfully",
    });
  },
);

// Unregister webhook
webhookRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/:subscriptionId",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              message: z.string(),
            }),
          },
        },
        description: "Webhook unregistered",
      },
    },
  }),
  async (c) => {
    const { subscriptionId } = c.req.param();
    eventEmitter.unsubscribe(subscriptionId);

    return c.json({ message: "Webhook unregistered successfully" });
  },
);

// List webhooks
webhookRoutes.openapi(
  createRoute({
    method: "get",
    path: "/list",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              subscriptions: z.array(
                z.object({
                  id: z.string(),
                  url: z.string(),
                  eventTypes: z.array(z.string()),
                  active: z.boolean(),
                }),
              ),
            }),
          },
        },
        description: "List of all webhooks",
      },
    },
  }),
  async (c) => {
    const subscribers = eventEmitter.getSubscribers();
    const allSubscriptions: any[] = [];

    for (const [eventType, subs] of subscribers.entries()) {
      for (const sub of subs) {
        if (!allSubscriptions.find((s) => s.id === sub.id)) {
          allSubscriptions.push({
            id: sub.id,
            url: sub.url,
            eventTypes: sub.eventTypes,
            active: sub.active,
          });
        }
      }
    }

    return c.json({ subscriptions: allSubscriptions });
  },
);

// Get event history
webhookRoutes.openapi(
  createRoute({
    method: "get",
    path: "/events",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              events: z.array(
                z.object({
                  eventId: z.string(),
                  eventType: z.string(),
                  timestamp: z.string(),
                  userId: z.string(),
                  assetCode: z.string(),
                  amount: z.string(),
                }),
              ),
            }),
          },
        },
        description: "Recent event history",
      },
    },
  }),
  async (c) => {
    const history = eventEmitter.getHistory(100);

    return c.json({
      events: history.map((event) => ({
        eventId: event.eventId,
        eventType: event.eventType,
        timestamp: event.timestamp.toISOString(),
        userId: event.userId,
        assetCode: event.assetCode,
        amount: event.amount,
      })),
    });
  },
);

export default webhookRoutes;
