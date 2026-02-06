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

// Queue for scheduled booking driver reminders (1 hour before pickup)
export const scheduledReminderQueue = new Queue("scheduledReminder", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

console.log("BullMQ queues initialized");
