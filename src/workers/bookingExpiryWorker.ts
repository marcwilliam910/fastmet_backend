import { Worker, Job } from "bullmq";
import { Server } from "socket.io";
import redisConnection from "../config/redis";
import BookingModel from "../models/Booking";
import NotificationModel from "../models/Notification";

interface BookingExpiryJobData {
  bookingId: string;
}

export const startBookingExpiryWorker = (io: Server) => {
  const worker = new Worker<BookingExpiryJobData>(
    "bookingExpiry",
    async (job: Job<BookingExpiryJobData>) => {
      const { bookingId } = job.data;

      console.log(`⏰ Processing expiry job for booking ${bookingId}`);

      // Check if booking still exists and is still "searching"
      const booking = await BookingModel.findById(bookingId).lean();

      if (!booking) {
        console.log(`Booking ${bookingId} no longer exists, skipping`);
        return;
      }

      if (booking.status !== "searching") {
        console.log(
          `Booking ${bookingId} status is "${booking.status}", not "searching", skipping`,
        );
        return;
      }

      // Delete the booking
      await BookingModel.findByIdAndDelete(bookingId);

      // Create notification for client
      const notification = await NotificationModel.create({
        userId: booking.customerId,
        userType: "Client",
        title: "Booking Expired",
        message:
          "10 minutes has passed but no drivers were available for your delivery request. Please try booking again.",
        type: "booking_expired",
        data: {
          bookingId: booking._id,
          pickUp: booking.pickUp,
          dropOff: booking.dropOff,
        },
      });

      const unreadNotifications = await NotificationModel.countDocuments({
        userId: booking.customerId,
        userType: {
          $in: ["Client", "All"],
        },
        isRead: false,
      });

      // Notify the customer who created the booking
      io.to(booking.customerId.toString()).emit("bookingExpired", {
        message:
          "10 minutes has passed but no drivers were available for your delivery request. Please try booking again.",
        notification,
        unreadNotifications,
      });

      // Notify all drivers in the temporary room
      const temporaryRoom = `BOOKING_${bookingId}`;
      io.to(temporaryRoom).emit("bookingExpired", {
        bookingId,
      });

      // Cleanup room - remove all sockets from the room
      const socketsInRoom = await io.in(temporaryRoom).fetchSockets();
      socketsInRoom.forEach((s) => s.leave(temporaryRoom));

      console.log(`🗑️  Deleted expired booking ${bookingId}`);
    },
    {
      connection: redisConnection,
      concurrency: 5, // Process up to 5 jobs concurrently
      drainDelay: 10_000, // Wait 10 seconds before checking for new jobs after processing the current batch
    },
  );

  worker.on("completed", (job) => {
    console.log(`✅ Expiry job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ Expiry job ${job?.id} failed:`, err);
  });

  worker.on("error", async (err) => {
    if (err.message.includes("max requests limit exceeded")) {
      console.error("Upstash limit reached. Shutting down worker...");
      await worker.close();
      process.exit(1);
    }
  });

  console.log("📦 Booking expiry worker started");

  return worker;
};
