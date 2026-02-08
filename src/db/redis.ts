import Redis from "ioredis";
import { logger } from "../utils/logger";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
});

redis.on("connect", () => {
  logger.info("Connected to Redis");
});

redis.on("error", (err) => {
  logger.error(err, "Redis error");
});
