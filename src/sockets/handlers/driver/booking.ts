import { Server } from "socket.io";
import { CustomSocket } from "../../socket";
import BookingModel from "../../../models/Booking";
import { withErrorHandling } from "../../../utils/socketWrapper";
import { SOCKET_ROOMS } from "../../../utils/constants";
import {
  canAcceptAsapBooking,
  canAcceptScheduledBooking,
} from "../../../utils/helpers/bookingFeasibility";

export const acceptBooking = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on(
    "acceptBooking",
    async ({
      bookingId,
      driverData,
      type,
    }: {
      bookingId: string;
      driverData: { id: string; name: string; rating: number };
      type: "asap" | "schedule" | "pooling";
    }) => {
      if (!bookingId) throw new Error("bookingId is required");
      if (!driverData.id || !driverData.name || driverData.rating == null) {
        throw new Error("Invalid driver data");
      }

      // avoid overlapping scheduled bookings
      const scheduledBookings = await BookingModel.find({
        "driver.id": driverData.id,
        status: "scheduled",
        "bookingType.type": "schedule",
      });

      if (type === "schedule") {
        const result = await canAcceptScheduledBooking(
          bookingId,
          scheduledBookings
        );

        if (!result.ok) {
          socket.emit("acceptBookingError", {
            message: result.reason,
          });
          return;
        }
      }
      if (type === "asap") {
        const result = await canAcceptAsapBooking(bookingId, scheduledBookings);

        if (!result.ok) {
          socket.emit("acceptBookingError", {
            message: result.reason,
          });
          return;
        }
      }

      const booking = await BookingModel.findOneAndUpdate(
        { _id: bookingId, status: "pending" },

        {
          driver: driverData,
          status: type === "asap" ? "active" : "scheduled",
        },
        { new: true }
      );

      if (!booking) {
        socket.emit("acceptBookingError", {
          message: "This booking has already been accepted by another driver.",
        });
        return;
      }

      const room = `BOOKING_${bookingId}`;

      // ✅ Mark driver as unavailable if they accepted an ASAP booking (on a trip now)
      if (type === "asap") {
        socket.leave(SOCKET_ROOMS.AVAILABLE);
        console.log(
          `✅ Driver ${socket.userId} accepted booking ${bookingId} and is now UNAVAILABLE`
        );
      }

      // Notify the client who booked
      io.to(booking.customerId.toString()).emit("bookingAccepted", {
        customerId: booking.customerId,
      });

      // Confirm to driver
      socket.emit("acceptanceConfirmed", { bookingId, bookingType: type });

      // Notify other drivers this booking is taken
      io.to(room).emit("bookingTaken", { bookingId });

      io.in(room).socketsLeave(room);
    }
  );
};

// export const completeBooking = (socket: CustomSocket) => {
//   const on = withErrorHandling(socket);

//   on("completeBooking", async ({ bookingId }: { bookingId: string }) => {
//     const booking = await BookingModel.findByIdAndUpdate(
//       bookingId,
//       { status: "completed" },
//       { new: true }
//     );

//     if (!booking) throw new Error("Booking not found");

//     // ✅ Mark driver as available again
//     socket.join(SOCKET_ROOMS.AVAILABLE);

//     // Notify client
//     socket
//       .to(booking.customerId.toString())
//       .emit("bookingCompleted", { bookingId });

//     socket.emit("completionConfirmed", { bookingId });

//     console.log(
//       `✅ Booking ${bookingId} completed, driver ${socket.userId} is AVAILABLE again`
//     );
//   });
// };

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
