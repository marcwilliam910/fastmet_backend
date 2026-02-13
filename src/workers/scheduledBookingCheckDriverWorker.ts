import { Worker, Job } from "bullmq";
import { Server } from "socket.io";
import BookingModel from "../models/Booking";
import redisConnection from "../config/redis";
import NotificationModel from "../models/Notification";
import {
  sendNotifToClient,
  sendNotifToDriver,
} from "../utils/pushNotifications";
import { formatDate } from "../utils/helpers/date";
import { scheduledBookingCheckDriverQueue } from "../queues";

type Checkpoint = "T5" | "T2" | "T0.20";

interface ScheduledBookingCheckJobData {
  bookingId: string;
  checkpoint: Checkpoint;
  driverId: string;
}

export const startScheduledBookingCheckDriverWorker = (io: Server) => {
  const worker = new Worker<ScheduledBookingCheckJobData>(
    "scheduledBookingCheckDriver",
    async (job: Job<ScheduledBookingCheckJobData>) => {
      const { bookingId, checkpoint, driverId } = job.data;

      console.log(`Scheduled check ${checkpoint} for booking ${bookingId}`);

      const booking = await BookingModel.findById(bookingId).lean();

      if (!booking) {
        console.log(`Booking ${bookingId} no longer exists, skipping`);
        return;
      }

      if (booking.driverId?.toString() !== driverId) {
        console.log(
          `Booking ${bookingId} is not assigned to driver ${driverId}, skipping`,
        );
        return;
      }

      if (checkpoint === "T5") {
        if (booking.status !== "scheduled") {
          console.log(`Booking ${bookingId} is not scheduled, skipping`);
          return;
        }

        // Scenario A - notify driver that their scheduled booking is near pickup time
        await createNotifAndPush(
          driverId,
          "Upcoming pickup reminder",
          `You have a scheduled pickup at ${formatDate(booking.bookingType.value.toString())} in ${booking.pickUp.name}. Be ready!`,
          "upcoming_pickup_reminder",
          {
            pickUp: booking.pickUp,
            dropOff: booking.dropOff,
            pickup_time: booking.bookingType.value,
          },
        );
      }

      if (checkpoint === "T2") {
        if (booking.status !== "scheduled") {
          console.log(`Booking ${bookingId} is not scheduled, skipping`);
          return;
        }

        await createNotifAndPush(
          driverId,
          "Time to head to pickup",
          `Your pickup is in 2 hours at ${booking.pickUp.name}. Start heading there now.`,
          "time_to_prepare_for_pickup",
          {
            pickUp: booking.pickUp,
            dropOff: booking.dropOff,
            bookingId,
          },
        );
      }

      if (checkpoint === "T0.20") {
        if (booking.status !== "active") {
          await autoRemoveDriverFromBooking(io, bookingId, driverId);
        }
      }
    },
    {
      connection: redisConnection,
      concurrency: 5,
    },
  );

  worker.on("completed", (job) => {
    console.log(`Scheduled check job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`Scheduled check job ${job?.id} failed:`, err);
  });

  console.log("Scheduled booking check worker started");
  return worker;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createNotifAndPush(
  driverId: string,
  title: string,
  message: string,
  type: string,
  data: Record<string, any>,
) {
  await NotificationModel.create({
    userId: driverId,
    userType: "Driver",
    title,
    message,
    type,
    data,
  });

  await sendNotifToDriver(driverId, title, message, data);
}

async function autoRemoveDriverFromBooking(
  io: Server,
  bookingId: string,
  driverId: string,
) {
  const updated = await BookingModel.findOneAndUpdate(
    { _id: bookingId },
    {
      driverId: null,
      status: "pending",
      $pull: { requestedDrivers: driverId },
    },
    { new: true },
  );
  if (!updated) return;

  const message =
    "Your driver was removed due to a delay that may impact your pickup time. Please confirm if you would like to reschedule the pickup or wait for a new driver assignment.";

  const notification = await NotificationModel.create({
    userId: updated.customerId.toString(),
    userType: "Client",
    title: "Driver unavailable",
    message,
    type: "driver_unavailable",
    data: { bookingId, pickUp: updated.pickUp, dropOff: updated.dropOff },
  });

  const unreadNotifications = await NotificationModel.countDocuments({
    userId: updated.customerId,
    userType: {
      $in: ["Driver", "All"],
    },
    isRead: false,
  });

  //driver gonna be late
  await sendNotifToClient(
    updated.customerId.toString(),
    "Driver unavailable",
    message,
    {
      bookingId,
    },
  );

  io.to(updated.customerId.toString()).emit("driverUnavailable", {
    bookingId,
    driverId,
    notification,
    unreadNotifications,
  });
}

export const scheduleDriverCheckInJobs = async (
  bookingId: string,
  scheduledDate: Date,
  driverId: string,
) => {
  const pickupMs = new Date(scheduledDate).getTime();
  const bookingIdForCheck = String(bookingId);
  const checkpoints = [
    { checkpoint: "T5", offset: 5 * 60 * 60 * 1000 },
    { checkpoint: "T2", offset: 2 * 60 * 60 * 1000 },
    { checkpoint: "T0.20", offset: 20 * 60 * 1000 }, //20 minutes before pickup
  ] as const;

  for (const { checkpoint, offset } of checkpoints) {
    const fireAt = pickupMs - offset;
    if (fireAt > Date.now()) {
      await scheduledBookingCheckDriverQueue.add(
        "remind-driver",
        { bookingId: bookingIdForCheck, checkpoint, driverId },
        {
          delay: fireAt - Date.now(),
          jobId: `sched-${checkpoint}-${bookingIdForCheck}-${driverId}`,
        },
      );
    }
  }
  console.log(
    `📋 Scheduled driver check-in jobs for booking ${bookingIdForCheck}`,
  );
};

export const removeDriverCheckInJobs = async (
  bookingId: string,
  driverId: string,
) => {
  for (const cp of ["T5", "T2", "T0.20"]) {
    try {
      const job = await scheduledBookingCheckDriverQueue.getJob(
        `sched-${cp}-${bookingId}-${driverId}`,
      );
      if (job) await job.remove();
    } catch {}
  }
};
