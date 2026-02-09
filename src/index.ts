import { OpenAPIHono } from "@hono/zod-openapi";
import { logger as honoLogger } from "hono/logger";
import { swaggerUI } from "@hono/swagger-ui";
import walletRoutes from "./routes/wallet";
import webhookRoutes from "./routes/webhooks";
import metricsRoutes from "./routes/metrics";
import { metricsMiddleware } from "./monitoring/metrics";
import { rateLimiter } from "./middlewares/rateLimiter";
import { logger } from "./utils/logger";

const app = new OpenAPIHono();

app.use(honoLogger((str) => logger.info(str)));
app.use("*", metricsMiddleware());

app.use(
  "*",
  rateLimiter({ windowMs: 60 * 1000, max: 1000, keyPrefix: "global" }),
);
app.use(
  "/wallet/*",
  rateLimiter({ windowMs: 60 * 1000, max: 1000, keyPrefix: "wallet" }),
);

app.get("/", (c) => {
  return c.json({
    service: "Dino Wallet Service",
    version: "1.0.0",
    status: "running",
    endpoints: {
      wallet: "/wallet",
      webhooks: "/webhooks",
      metrics: "/metrics",
      health: "/metrics/health",
      swagger: "/swagger",
      docs: "/doc",
    },
  });
});

app.route("/wallet", walletRoutes);
app.route("/webhooks", webhookRoutes);
app.route("/metrics", metricsRoutes);

app.doc("/doc", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "Wallet Service API",
    description:
      "API for managing user wallets, transactions, webhooks, and metrics",
  },
});

app.get(
  "/swagger",
  swaggerUI({
    url: "/doc",
  }),
);

const port = process.env.PORT || 3000;

logger.info(`Server is starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
