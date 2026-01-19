import { Server } from "socket.io";
import BookingModel from "../../models/Booking";
import { bookingTimers } from "../../sockets/handlers/client/booking";

export const restoreBookingTimers = async (io: Server) => {
  console.log("🔄 Restoring booking timers after server restart...");

  const searchingBookings = await BookingModel.find({
    status: "searching",
  });

  for (const booking of searchingBookings) {
    const createdAt = booking.createdAt.getTime();
    const expiresAt = createdAt + 10 * 60 * 1000; // 10 minutes from creation
    const now = Date.now();
    const timeRemaining = expiresAt - now;

    if (timeRemaining <= 0) {
      // Already expired - delete immediately
      console.log(
        `⏰ Booking ${booking._id} expired during downtime - deleting`
      );

      await BookingModel.findByIdAndDelete(booking._id);

      const temporaryRoom = `BOOKING_${booking._id}`;
      io.to(temporaryRoom).emit("bookingExpired", {
        bookingId: booking._id,
      });

      const socketsInRoom = await io.in(temporaryRoom).fetchSockets();
      socketsInRoom.forEach((s) => s.leave(temporaryRoom));
    } else {
      // Still valid - restore timer with remaining time
      console.log(
        `⏱️  Restoring timer for ${booking._id} with ${Math.round(
          timeRemaining / 1000
        )}s remaining`
      );

      const timer = setTimeout(async () => {
        const freshBooking = await BookingModel.findById(booking._id);

        if (freshBooking && freshBooking.status === "searching") {
          await BookingModel.findByIdAndDelete(booking._id);

          const temporaryRoom = `BOOKING_${booking._id}`;
          io.to(temporaryRoom).emit("bookingExpired", {
            bookingId: booking._id,
          });

          const socketsInRoom = await io.in(temporaryRoom).fetchSockets();
          socketsInRoom.forEach((s) => s.leave(temporaryRoom));

          console.log(`🗑️  Deleted booking ${booking._id} after timeout`);
        }

        bookingTimers.delete(String(booking._id));
      }, timeRemaining);

      bookingTimers.set(String(booking._id), timer);
    }
  }

  console.log(`✅ Restored ${searchingBookings.length} booking timers`);
};
