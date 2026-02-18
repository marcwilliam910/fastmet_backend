import { Redis } from "ioredis";

const redisConnection = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
  // tls: {}, // Redis Cloud requires this
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

redisConnection.on("connect", () => {
  console.log("Redis connected");
});

redisConnection.on("error", (err) => {
  console.error("Redis connection error:", err);
});

export default redisConnection;
