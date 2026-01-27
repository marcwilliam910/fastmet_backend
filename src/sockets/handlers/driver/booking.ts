import { Server } from "socket.io";
import { CustomSocket } from "../../socket";
import BookingModel from "../../../models/Booking";
import { withErrorHandling } from "../../../utils/socketWrapper";
import { SOCKET_ROOMS } from "../../../utils/constants";
import {
  canAcceptAsapBooking,
  canAcceptScheduledBooking,
} from "../../../utils/helpers/bookingFeasibility";
import mongoose from "mongoose";
import { sendNotifToClient } from "../../../utils/pushNotifications";
import DriverModel from "../../../models/Driver";

// export const acceptBooking = (socket: CustomSocket, io: Server) => {
//   const on = withErrorHandling(socket);

//   on(
//     "acceptBooking",
//     async ({
//       bookingId,
//       driverId,
//       type,
//     }: {
//       bookingId: string;
//       driverId: string;
//       type: "asap" | "schedule" | "pooling"; //remove ASAP
//     }) => {
//       if (!bookingId || !driverId)
//         throw new Error("bookingId and driverId is required");

//       // avoid overlapping scheduled bookings
//       const scheduledBookings = await BookingModel.find({
//         driverId: driverId,
//         status: "scheduled",
//         "bookingType.type": "schedule",
//       });

//       if (type === "schedule") {
//         const result = await canAcceptScheduledBooking(
//           bookingId,
//           scheduledBookings,
//         );

//         if (!result.ok) {
//           socket.emit("acceptBookingError", {
//             message: result.reason,
//           });
//           return;
//         }
//       }
//       if (type === "asap") {
//         const result = await canAcceptAsapBooking(bookingId, scheduledBookings);

//         if (!result.ok) {
//           socket.emit("acceptBookingError", {
//             message: result.reason,
//           });
//           return;
//         }
//       }

//       const booking = await BookingModel.findOneAndUpdate(
//         { _id: bookingId, status: "pending" },

//         {
//           driverId: driverId,
//           status: type === "asap" ? "active" : "scheduled",
//         },
//         { new: true },
//       );

//       if (!booking) {
//         socket.emit("acceptBookingError", {
//           message: "This booking has already been accepted by another driver.",
//         });
//         return;
//       }

//       const room = `BOOKING_${bookingId}`;

//       // ✅ Mark driver as unavailable if they accepted an ASAP booking (on a trip now)
//       if (type === "asap") {
//         socket.leave(SOCKET_ROOMS.AVAILABLE);
//         console.log(
//           `✅ Driver ${socket.userId} accepted booking ${bookingId} and is now UNAVAILABLE`,
//         );
//       }

//       // Notify the client who booked
//       // for in-app toast
//       io.to(booking.customerId.toString()).emit("bookingAccepted", {
//         customerId: booking.customerId,
//       });
//       // for push notif
//       await sendNotifToClient(
//         booking.customerId.toString(),
//         "📦 Booking Accepted!",
//         "Your booking request has been accepted by a driver. Tap to view details.",
//       );

//       // Confirm to driver
//       socket.emit("acceptanceConfirmed", { bookingId, bookingType: type });

//       // Notify other drivers this booking is taken
//       io.to(room).emit("bookingTaken", { bookingId });

//       io.in(room).socketsLeave(room);
//     },
//   );
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
    },
  );
};

export const handleStartScheduledTrip = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on(
    "startScheduledTrip",
    async (data: { bookingId: string; driverId: string }) => {
      const { bookingId, driverId } = data;

      console.log(`🚗 Driver ${driverId} starting scheduled trip ${bookingId}`);

      const hasActive = await BookingModel.exists({
        driverId: new mongoose.Types.ObjectId(driverId),
        status: "active",
      });

      console.log("has active: ", hasActive);

      if (hasActive) {
        socket.emit("startScheduledTripError", {
          message: "You still have an active trip, please complete it first",
        });
        return;
      }

      // First find without populate for validation
      const booking = await BookingModel.findById(bookingId)
        .populate({
          path: "customerId",
          select: "fullName profilePictureUrl phoneNumber",
        })
        .lean();

      if (!booking) {
        socket.emit("startScheduledTripError", {
          message: "Booking not found",
        });
        return;
      }
      // Verify it's the correct driver
      if (booking.driverId?.toString() !== driverId) {
        socket.emit("startScheduledTripError", {
          message: "This booking is not assigned to you",
        });
        return;
      }

      // Verify status is 'scheduled'
      if (booking.status !== "scheduled") {
        socket.emit("startScheduledTripError", {
          message: `Cannot start trip. Current status: ${booking.status}`,
        });
        return;
      }

      // Check if it's within the allowed time window (15 minutes before)
      const now = new Date();
      const scheduledTime = new Date(booking.bookingType.value);
      const minutesUntil = (scheduledTime.getTime() - now.getTime()) / 60000;

      if (minutesUntil > 15) {
        socket.emit("startScheduledTripError", {
          message: `Too early. You can start this trip ${Math.ceil(
            minutesUntil - 15,
          )} minutes from now.`,
        });
        return;
      }

      // ✅ Update using updateOne (more efficient)
      await BookingModel.updateOne(
        { _id: bookingId },
        {
          $set: {
            status: "active",
          },
        },
      );

      console.log(`✅ Trip ${bookingId} status changed: scheduled → active`);

      const { customerId, ...rest } = booking as any;

      const formattedBooking = {
        ...rest,
        client: {
          id: customerId._id,
          name: customerId.fullName,
          profilePictureUrl: customerId.profilePictureUrl,
          phoneNumber: customerId.phoneNumber,
        },
      };

      socket.emit("scheduledTripStarted", {
        booking: formattedBooking,
      });

      // Get customerId for notification (already have it from booking above)
      // const customerId = booking.customerId;

      // if (customerId) {
      //   io.to(`customer_${customerId.toString()}`).emit("driverStarted", {
      //     bookingId: booking._id,
      //     message: "Your driver has started the trip and is on the way!",
      //   });
      // }
    },
  );
};

export const requestAcceptance = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on(
    "requestAcceptance",
    async (payload: {
      id: string; // driver ID
      bookingId: string;
      clientUserId: string;
      name: string;
      vehicleImage: string;
      distance: number;
      profilePicture: string;
      type: "asap" | "schedule" | "pooling";
    }) => {
      const { id: driverId, bookingId, clientUserId } = payload;

      // ✅ Check if driver already offered for this booking
      const booking = await BookingModel.findById(bookingId);

      if (!booking) {
        socket.emit("requestAcceptanceError", {
          message: "Booking not found",
          bookingId,
        });
        return;
      }

      // ✅ Prevent spam: Check if driver already in requestedDrivers
      if (booking.requestedDrivers?.some((id) => id.toString() === driverId))
        return;

      // Avoid overlapping scheduled bookings
      const scheduledBookings = await BookingModel.find({
        driverId: driverId,
        status: "scheduled",
        "bookingType.type": "schedule",
      });
      const result = await canAcceptAsapBooking(bookingId, scheduledBookings);

      if (!result.ok) {
        socket.emit("requestAcceptanceError", {
          message: result.reason,
          bookingId,
        });
        return;
      }

      // Get rating
      const driver = await DriverModel.findById(driverId);
      if (!driver) {
        socket.emit("requestAcceptanceError", {
          message: "Driver not found",
          bookingId,
        });
        console.log("driver not found");
        return;
      }

      // Get total completed bookings
      const totalBookings = await BookingModel.countDocuments({
        driverId: new mongoose.Types.ObjectId(driverId),
        status: "completed",
      });

      // ✅ Add driver to requestedDrivers array using $addToSet to prevent duplicates
      await BookingModel.findByIdAndUpdate(bookingId, {
        $addToSet: { requestedDrivers: driverId },
      });

      console.log(`🚗 Driver ${driverId} offered for booking ${bookingId}`);

      const driverPayload = {
        id: driverId,
        name: payload.name,
        vehicleImage: payload.vehicleImage,
        profilePicture: payload.profilePicture,
        totalBookings,
        rating: driver.rating.average,
      };

      // Emit to customer
      if (payload.type === "asap") {
        io.to(clientUserId).emit("acceptanceRequestedASAP", {
          ...driverPayload,
          distance: payload.distance,
        });
      } else if (payload.type === "schedule") {
        io.to(clientUserId).emit("acceptanceRequestedSchedule", {
          ...driverPayload,
          bookingId,
        });
      }

      // Confirm to driver
      socket.emit("offer_sent", {
        success: true,
        message: "Your offer has been sent to the customer",
        bookingId,
      });
    },
  );
};

export const cancelOffer = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on(
    "cancelOffer",
    async (payload: { clientId: string; id: string; bookingId: string }) => {
      const { clientId, id, bookingId } = payload;

      await BookingModel.updateOne(
        { _id: bookingId },
        { $pull: { requestedDrivers: id } },
      );

      socket.emit("offerCancelledConfirmed", { bookingId });

      io.to(clientId).emit("offerCancelled", { driverId: id });
    },
  );
};
