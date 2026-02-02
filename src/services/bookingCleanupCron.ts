import {Server} from "socket.io";
import cron from "node-cron";
import BookingModel from "../models/Booking";
import {bookingTimers} from "../sockets/handlers/client/booking";
import NotificationModel from "../models/Notification";

export const startBookingCleanupCron = (io: Server) => {
  // Run every 2 minutes to check for expired bookings
  cron.schedule("*/2 * * * *", async () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const expiredBookings = await BookingModel.find({
      status: "searching",
      createdAt: {$lt: tenMinutesAgo},
    });

    for (const booking of expiredBookings) {
      // Create notification for client
      await NotificationModel.create({
        userId: booking.customerId,
        userType: "Client",
        title: "Booking Expired",
        message:
          "10 minutes has passed but no drivers were available for your delivery request.",
        type: "booking_expired",
        data: {
          bookingId: booking._id,
          pickUp: booking.pickUp,
          dropOff: booking.dropOff,
        },
      });

      await BookingModel.findByIdAndDelete(booking._id);

      // Notify all drivers in the temporary room
      const temporaryRoom = `BOOKING_${booking._id}`;
      io.to(temporaryRoom).emit("bookingExpired", {
        bookingId: booking._id,
      });

      const socketsInRoom = await io.in(temporaryRoom).fetchSockets();
      socketsInRoom.forEach((s) => s.leave(temporaryRoom));

      // Clear timer if it exists
      const timer = bookingTimers.get(String(booking._id));
      if (timer) {
        clearTimeout(timer);
        bookingTimers.delete(String(booking._id));
      }

      console.log(`🧹 Cron cleaned up expired booking ${booking._id}`);
    }

    if (expiredBookings.length > 0) {
      console.log(
        `✅ Cron job cleaned up ${expiredBookings.length} expired bookings`,
      );
    }
  });

  console.log("🕐 Booking cleanup cron job started (runs every 2 minutes)");
};
