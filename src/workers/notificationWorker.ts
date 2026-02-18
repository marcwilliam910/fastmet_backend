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
      concurrency: 2, //10
      drainDelay: 10_000, // Wait 10 seconds before checking for new jobs after processing the current batch
    },
  );

  worker.on("completed", (job) => {
    console.log(`Notification job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Notification job ${job?.id} failed:`, err);
  });

  worker.on("error", async (err) => {
    if (err.message.includes("max requests limit exceeded")) {
      console.error("Upstash limit reached. Shutting down worker...");
      await worker.close();
      process.exit(1);
    }
  });

  console.log("Notification worker started");
  return worker;
};
