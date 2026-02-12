import { Job, Worker } from "bullmq";
import redisConnection from "../config/redis";
import {
  NotificationJobData,
  processNotificationJob,
} from "../utils/pushNotifications";

export const startNotificationWorker = () => {
  const worker = new Worker<NotificationJobData>(
    "notification",
    async (job: Job<NotificationJobData>) => {
      await processNotificationJob(job.data);
    },
    {
      connection: redisConnection,
      concurrency: 10,
    },
  );

  worker.on("completed", (job) => {
    console.log(`Notification job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Notification job ${job?.id} failed:`, err);
  });

  console.log("Notification worker started");
  return worker;
};
