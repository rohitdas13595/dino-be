import { Context, Next } from "hono";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyPrefix?: string;
}

export const rateLimiter = (config: RateLimitConfig) => {
  const { windowMs, max, keyPrefix = "rl" } = config;

  return async (c: Context, next: Next) => {
    // Bypass rate limiting during tests
    if (process.env.NODE_ENV === "test") {
      return await next();
    }

    const ip = c.req.header("x-forwarded-for") || "unknown";
    const key = `${keyPrefix}:${ip}`;

    try {
      const current = await redis.get(key);
      const count = current ? parseInt(current) : 0;

      if (count >= max) {
        logger.warn({ ip, key }, "Rate limit exceeded");
        return c.json({ error: "Too many requests" }, 429);
      }

      const multi = redis.multi();
      multi.incr(key);
      if (count === 0) {
        multi.pexpire(key, windowMs);
      }
      await multi.exec();

      await next();
    } catch (err) {
      logger.error({ err }, "Rate limiter error");
      // Fail open to avoid blocking users if Redis is down
      await next();
    }
  };
};
