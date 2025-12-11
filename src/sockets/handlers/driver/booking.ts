import { Server } from "socket.io";
import { CustomSocket } from "../../socket";
import BookingModel from "../../../models/Booking";
import { withErrorHandling } from "../../../utils/socketWrapper";
import { SOCKET_ROOMS } from "../../../utils/constants";

export const acceptBooking = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on(
    "acceptBooking",
    async ({
      bookingId,
      driverData,
    }: {
      bookingId: string;
      driverData: { id: string; name: string; rating: number };
    }) => {
      if (!bookingId) throw new Error("bookingId is required");
      if (!driverData.id || !driverData.name || driverData.rating == null) {
        throw new Error("Invalid driver data");
      }

      const booking = await BookingModel.findOneAndUpdate(
        { _id: bookingId, status: "pending" },

        {
          driver: driverData,
          status: "active",
        },
        { new: true }
      );

      if (!booking) {
        socket.emit("acceptBookingError", {
          message: "This booking has already been accepted by another driver.",
        });
        return; // Stop execution cleanly
      }

      const room = `BOOKING_${bookingId}`;

      // ✅ Mark driver as unavailable (on a trip now)
      socket.leave(SOCKET_ROOMS.AVAILABLE);

      // Notify the client who booked
      io.to(booking.customerId.toString()).emit("bookingAccepted", {
        customerId: booking.customerId,
      });

      // Confirm to driver
      socket.emit("acceptanceConfirmed", { bookingId });

      // Notify other drivers this booking is taken
      io.to(room).emit("bookingTaken", { bookingId });

      console.log(
        `✅ Driver ${socket.userId} accepted booking ${bookingId} and is now UNAVAILABLE`
      );

      io.in(room).socketsLeave(room);
    }
  );
};

export const completeBooking = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);

  on("completeBooking", async ({ bookingId }: { bookingId: string }) => {
    const booking = await BookingModel.findByIdAndUpdate(
      bookingId,
      { status: "completed" },
      { new: true }
    );

    if (!booking) throw new Error("Booking not found");

    // ✅ Mark driver as available again
    socket.join(SOCKET_ROOMS.AVAILABLE);

    // Notify client
    socket
      .to(booking.customerId.toString())
      .emit("bookingCompleted", { bookingId });

    socket.emit("completionConfirmed", { bookingId });

    console.log(
      `✅ Booking ${bookingId} completed, driver ${socket.userId} is AVAILABLE again`
    );
  });
};

export const driverLocation = (socket: CustomSocket, io: Server) => {
  socket.on(
    "driverLocation",
    ({
      clientUserId,
      bookingId,
      driverLoc,
    }: {
      clientUserId: string;
      bookingId: string;
      driverLoc: { lat: number; lng: number; heading: number };
    }) => {
      if (!driverLoc || !clientUserId || !bookingId) return;

      console.log(`📍 Sending driver location to client ${clientUserId}`);

      // Send location back to the client
      io.to(clientUserId).emit("driverLocationResponse", { driverLoc });
    }
  );
};
