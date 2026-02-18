import { Queue } from "bullmq";
import redisConnection from "../config/redis";

// Queue for ASAP booking expiry (10 minutes after creation)
export const bookingExpiryQueue = new Queue("bookingExpiry", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100, // Keep last 100 failed jobs for debugging
  },
});

export const notificationQueue = new Queue("notification", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000,
    },
  },
});

// Queue for scheduled booking lifecycle jobs (client + driver checkpoints)
export const scheduledBookingLifecycleQueue = new Queue(
  "scheduledBookingLifecycle",
  {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: 100,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
    },
  },
);

// Backward-compatible aliases so producers can keep existing imports.
export const scheduledBookingCheckClientQueue = scheduledBookingLifecycleQueue;
export const scheduledBookingCheckDriverQueue = scheduledBookingLifecycleQueue;

console.log("BullMQ queues initialized");
