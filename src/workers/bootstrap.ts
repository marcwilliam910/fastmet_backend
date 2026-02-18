import { Server } from "socket.io";
import { startBookingExpiryWorker } from "./bookingExpiryWorker";
import { startNotificationWorker } from "./notificationWorker";
import { startScheduledBookingLifecycleWorker } from "./scheduledBookingLifecycleWorker";

type ClosableWorker = {
  close: () => Promise<void>;
};

let workersStarted = false;
let workers: ClosableWorker[] = [];

export const startWorkers = (io: Server) => {
  if (workersStarted) {
    console.log("Workers already started, skipping duplicate initialization");
    return workers;
  }

  workers = [
    startBookingExpiryWorker(io),
    startNotificationWorker(),
    startScheduledBookingLifecycleWorker(io),
  ];

  workersStarted = true;
  console.log("BullMQ workers initialized");
  return workers;
};

export const shutdownWorkers = async () => {
  if (!workersStarted) return;

  await Promise.all(
    workers.map(async (worker) => {
      try {
        await worker.close();
      } catch (error) {
        console.error("Failed to close worker:", error);
      }
    }),
  );

  workers = [];
  workersStarted = false;
  console.log("BullMQ workers shut down");
};
