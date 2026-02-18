import { Worker, Job } from "bullmq";
import { Server } from "socket.io";
import redisConnection from "../config/redis";
import BookingModel from "../models/Booking";
import DriverModel from "../models/Driver";
import NotificationModel from "../models/Notification";
import { scheduledBookingCheckClientQueue } from "../queues";
import {
  sendNotifToClient,
  sendNotifToDriver,
} from "../utils/pushNotifications";
import { scheduleDriverCheckInJobs } from "./scheduledBookingCheckDriverWorker";

type Checkpoint = "T4" | "T2" | "T1";

export interface ScheduledBookingCheckClientJobData {
  bookingId: string;
  checkpoint: Checkpoint;
}

export const processScheduledBookingCheckClientJob = async (
  io: Server,
  jobData: ScheduledBookingCheckClientJobData,
) => {
  const { bookingId, checkpoint } = jobData;

  console.log(`Scheduled check ${checkpoint} for booking ${bookingId}`);

  const booking = await BookingModel.findById(bookingId).lean();

  if (!booking) {
    console.log(`Booking ${bookingId} no longer exists, skipping`);
    return;
  }

  // Already has a driver or is no longer pending
  if (booking.driverId || booking.status !== "pending") {
    console.log(
      `Booking ${bookingId} already resolved (status: ${booking.status}), skipping`,
    );
    return;
  }

  const hasOffers = booking.requestedDrivers.length > 0;
  const pickupTime = new Date(booking.bookingType.value);
  const timeStr = pickupTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (checkpoint === "T4") {
    if (hasOffers) {
      // Scenario A - T4: Has offers, hasn't chosen
      await createNotifAndPush(
        booking.customerId.toString(),
        "Choose your driver",
        `You have ${booking.requestedDrivers.length} offer(s) for your ${timeStr} pickup. Select one now!`,
        "scheduled_choose_driver",
        {
          pickUp: booking.pickUp,
          dropOff: booking.dropOff,
          bookingId,
        },
      );
    } else {
      // Scenario B - T4: No offers
      await createNotifAndPush(
        booking.customerId.toString(),
        "No drivers available yet",
        `No drivers have offered for your ${timeStr} pickup. Consider rescheduling or cancelling.`,
        "scheduled_no_drivers",
        {
          pickUp: booking.pickUp,
          dropOff: booking.dropOff,
          bookingId,
        },
      );
    }
  }

  if (checkpoint === "T2") {
    if (hasOffers) {
      // Scenario A - T2: Still hasn't chosen, warn about auto-assign
      await createNotifAndPush(
        booking.customerId.toString(),
        "Driver will be auto-assigned in 1 hour",
        "Choose your preferred driver or we'll assign the highest-rated one.",
        "scheduled_auto_assign_warning",
        {
          pickUp: booking.pickUp,
          dropOff: booking.dropOff,
          bookingId,
        },
      );
    }
    // Scenario B at T2: no offers, already notified at T4, nothing to do
  }

  if (checkpoint === "T1") {
    if (hasOffers) {
      await autoAcceptHighestRated(io, bookingId);
    } else {
      await autoCancelBooking(io, bookingId);
    }
  }
};

// export const startScheduledBookingCheckClientWorker = (io: Server) => {
//   const worker = new Worker<ScheduledBookingCheckClientJobData>(
//     "scheduledBookingCheckClient",
//     async (job: Job<ScheduledBookingCheckClientJobData>) => {
//       await processScheduledBookingCheckClientJob(io, job.data);
//     },
//     {
//       connection: redisConnection,
//       concurrency: 2, //5
//       drainDelay: 10_000, // Wait 10 seconds before checking for new jobs after processing the current batch
//     },
//   );

//   worker.on("completed", (job) => {
//     console.log(`Scheduled check job ${job.id} completed`);
//   });

//   worker.on("failed", (job, err) => {
//     console.error(`Scheduled check job ${job?.id} failed:`, err);
//   });

//   worker.on("error", async (err) => {
//     if (err.message.includes("max requests limit exceeded")) {
//       console.error("Upstash limit reached. Shutting down worker...");
//       await worker.close();
//       process.exit(1);
//     }
//   });

//   console.log("Scheduled booking check worker started");
//   return worker;
// };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createNotifAndPush(
  clientId: string,
  title: string,
  message: string,
  type: string,
  data: Record<string, any>,
) {
  await NotificationModel.create({
    userId: clientId,
    userType: "Client",
    title,
    message,
    type,
    data,
  });

  await sendNotifToClient(clientId, title, message, data);
}

async function autoAcceptHighestRated(io: Server, bookingId: string) {
  const booking = await BookingModel.findById(bookingId).lean();

  if (!booking || booking.driverId || booking.status !== "pending") return;
  if (booking.requestedDrivers.length === 0) return;

  // Get highest-rated driver in one query using sort + limit
  const topDriver = await DriverModel.findOne({
    _id: { $in: booking.requestedDrivers },
  })
    .sort({ "rating.average": -1 })
    .select("_id firstName lastName rating profilePictureUrl")
    .lean();

  if (!topDriver) {
    await autoCancelBooking(io, bookingId);
    return;
  }

  const driverId = topDriver._id.toString();

  // Assign driver
  const updated = await BookingModel.findOneAndUpdate(
    { _id: bookingId, status: "pending" },
    {
      driverId,
      status: "scheduled",
      // acceptedAt: new Date(),
    },
    { new: true },
  );

  if (!updated) return;

  const driverName = `${topDriver.firstName} ${topDriver.lastName}`;
  const customerId = booking.customerId.toString();

  // Notify client
  await createNotifAndPush(
    customerId,
    "Driver auto-assigned",
    `We've assigned ${driverName} to your booking.`,
    "scheduled_auto_assigned",
    {
      bookingId,
      pickUp: booking.pickUp,
      dropOff: booking.dropOff,
      driverId,
      driverName,
    },
  );

  io.to(customerId).emit("driverAcceptedSchedule", { bookingId });

  // Notify accepted driver (in-app + push)
  const notifMessage = `You have been auto-assigned a scheduled delivery from ${
    booking.pickUp?.name || "pickup"
  } to ${booking.dropOff?.name || "destination"}`;

  await NotificationModel.create({
    userId: driverId,
    userType: "Driver",
    title: "Scheduled Booking Confirmed",
    message: notifMessage,
    type: "new_scheduled_ride",
    data: {
      bookingId: booking._id,
      scheduledDate: booking.bookingType.value,
      pickUp: booking.pickUp,
      dropOff: booking.dropOff,
    },
  });

  await sendNotifToDriver(
    driverId,
    "Scheduled Booking Confirmed",
    notifMessage,
    {
      bookingId: booking._id,
      type: "new_scheduled_ride",
    },
  );

  io.to(driverId).emit("bookingConfirmedSchedule", { bookingId });

  // Notify rejected drivers
  for (const reqDriverId of booking.requestedDrivers) {
    const reqIdStr = reqDriverId.toString();
    if (reqIdStr === driverId) continue;

    const rejectedMessage = `Another driver was selected for the ${
      booking.pickUp?.name || "pickup"
    } to ${booking.dropOff?.name || "destination"} booking.`;

    await NotificationModel.create({
      userId: reqIdStr,
      userType: "Driver",
      title: "Booking Taken",
      message: rejectedMessage,
      type: "booking_taken",
      data: { bookingId: booking._id },
    });

    await sendNotifToDriver(reqIdStr, "Booking Taken", rejectedMessage, {
      bookingId: booking._id,
      type: "booking_taken",
    });

    io.to(reqIdStr).emit("bookingTakenSchedule", { bookingId });
  }

  // Cleanup temporary room
  const temporaryRoom = `BOOKING_${bookingId}`;
  io.to(temporaryRoom).emit("bookingExpired", { bookingId });
  const socketsInRoom = await io.in(temporaryRoom).fetchSockets();
  socketsInRoom.forEach((s) => s.leave(temporaryRoom));

  // Schedule driver reminder
  await scheduleDriverCheckInJobs(
    bookingId,
    booking.bookingType.value as Date,
    driverId,
  );

  console.log(`Auto-accepted: assigned ${driverName} to booking ${bookingId}`);
}

async function autoCancelBooking(io: Server, bookingId: string) {
  const updated = await BookingModel.findOneAndUpdate(
    { _id: bookingId, status: "pending" },
    { status: "cancelled", cancelledAt: new Date() },
    { new: true },
  );

  if (!updated) return;

  const customerId = updated.customerId.toString();

  await createNotifAndPush(
    customerId,
    "Booking cancelled",
    "We couldn't find available drivers for your scheduled pickup. Please try again or reschedule.",
    "scheduled_auto_cancelled",
    {
      pickUp: updated.pickUp,
      dropOff: updated.dropOff,
      bookingId,
    },
  );

  io.to(customerId).emit("bookingCancelled", { bookingId });

  // Cleanup temporary room
  const temporaryRoom = `BOOKING_${bookingId}`;
  io.to(temporaryRoom).emit("bookingCancelled", { bookingId });
  const socketsInRoom = await io.in(temporaryRoom).fetchSockets();
  socketsInRoom.forEach((s) => s.leave(temporaryRoom));

  console.log(`Auto-cancelled booking ${bookingId} (no offers)`);
}

export const scheduleClientCheckInJobs = async (
  bookingId: string,
  scheduledDate: Date,
) => {
  const pickupMs = new Date(scheduledDate).getTime();
  const bookingIdForCheck = String(bookingId);
  const checkpoints = [
    { checkpoint: "T4", offset: 4 * 60 * 60 * 1000 },
    { checkpoint: "T2", offset: 2 * 60 * 60 * 1000 },
    { checkpoint: "T1", offset: 1 * 60 * 60 * 1000 },
  ] as const;

  for (const { checkpoint, offset } of checkpoints) {
    const fireAt = pickupMs - offset;
    if (fireAt > Date.now()) {
      await scheduledBookingCheckClientQueue.add(
        "remind-client",
        { bookingId: bookingIdForCheck, checkpoint },
        {
          delay: fireAt - Date.now(),
          jobId: `sched-${checkpoint}-${bookingIdForCheck}`,
        },
      );
    }
  }
  console.log(
    `📋 Scheduled client check-in jobs for booking ${bookingIdForCheck}`,
  );
};

export const removeClientCheckInJobs = async (bookingId: string) => {
  for (const cp of ["T4", "T2", "T1"]) {
    try {
      const job = await scheduledBookingCheckClientQueue.getJob(
        `sched-${cp}-${bookingId}`,
      );
      if (job) await job.remove();
    } catch {}
  }
};
