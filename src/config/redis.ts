import { Redis } from "ioredis";

const redisConnection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null, // Required for BullMQ
});

redisConnection.on("connect", () => {
  console.log("Redis connected");
});

redisConnection.on("error", (err) => {
  console.error("Redis connection error:", err);
});

export default redisConnection;
