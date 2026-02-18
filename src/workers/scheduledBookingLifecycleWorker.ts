import { Job, Worker } from "bullmq";
import { Server } from "socket.io";
import redisConnection from "../config/redis";
import {
  processScheduledBookingCheckClientJob,
  ScheduledBookingCheckClientJobData,
} from "./scheduledBookingCheckClientWorker";
import {
  processScheduledBookingCheckDriverJob,
  ScheduledBookingCheckDriverJobData,
} from "./scheduledBookingCheckDriverWorker";

type ScheduledBookingLifecycleJobData =
  | ScheduledBookingCheckClientJobData
  | ScheduledBookingCheckDriverJobData;

const isDriverLifecycleJob = (
  jobData: ScheduledBookingLifecycleJobData,
): jobData is ScheduledBookingCheckDriverJobData =>
  "driverId" in jobData && typeof jobData.driverId === "string";

export const startScheduledBookingLifecycleWorker = (io: Server) => {
  const worker = new Worker<ScheduledBookingLifecycleJobData>(
    "scheduledBookingLifecycle",
    async (job: Job<ScheduledBookingLifecycleJobData>) => {
      if (isDriverLifecycleJob(job.data)) {
        await processScheduledBookingCheckDriverJob(io, job.data);
        return;
      }

      await processScheduledBookingCheckClientJob(io, job.data);
    },
    {
      connection: redisConnection,
      concurrency: 2, //8
      drainDelay: 10_000, // Wait 10 seconds before checking for new jobs after processing the current batch
    },
  );

  worker.on("completed", (job) => {
    console.log(`Scheduled lifecycle job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Scheduled lifecycle job ${job?.id} failed:`, err);
  });

  worker.on("error", async (err) => {
    if (err.message.includes("max requests limit exceeded")) {
      console.error("Upstash limit reached. Shutting down worker...");
      await worker.close();
      process.exit(1);
    }
  });

  console.log("Scheduled booking lifecycle worker started");
  return worker;
};
