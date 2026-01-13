import { Socket, Server } from "socket.io";
import BookingModel from "../../../models/Booking";
import { withErrorHandling } from "../../../utils/socketWrapper";
import { CustomSocket } from "../../socket";
import { calculateDistance } from "../../../utils/helpers/distanceCalculator";
import { MAX_DRIVER_RADIUS_KM, SOCKET_ROOMS } from "../../../utils/constants";
import UserModel from "../../../models/User";
import { RequestBooking } from "../../../types/booking";
import mongoose from "mongoose";

export const handleBookingSocket = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("request_booking", async (data: RequestBooking) => {
    console.log("📨 Booking request received:", data);

    /* ------------------------------------------------------------------ */
    /* 1. Save booking                                                     */
    /* ------------------------------------------------------------------ */
    const booking = await BookingModel.create({
      ...data,
      status: "pending",
    });

    const client = await UserModel.findById(booking.customerId)
      .select("fullName profilePictureUrl phoneNumber email")
      .lean();

    if (!client) {
      socket.emit("booking_request_saved", {
        success: false,
        message: "Client not found",
      });
      return;
    }

    const temporaryRoom = `BOOKING_${booking._id}`;

    socket.emit("booking_request_saved", {
      success: true,
      bookingId: booking._id,
      message: "Booking request saved successfully",
    });
    console.log("booking_request_saved called");

    /* ------------------------------------------------------------------ */
    /* 2. Vehicle filtering                                                */
    /* ------------------------------------------------------------------ */
    const vehicleType = booking.selectedVehicle?.key;

    if (!vehicleType) {
      console.log("Vehicle type not specified in booking");
      socket.emit("booking_request_failed", {
        message: "Vehicle type not specified in booking",
      });
      return;
    }

    const vehicleRoom = `VEHICLE_${vehicleType.toUpperCase()}`;

    /* ------------------------------------------------------------------ */
    /* 3. Fetch available drivers                                          */
    /* ------------------------------------------------------------------ */
    const availableDriverSockets = await io
      .in(SOCKET_ROOMS.ON_DUTY)
      .in(SOCKET_ROOMS.AVAILABLE)
      .in(vehicleRoom)
      .fetchSockets();

    console.log(
      `🔍 Found ${availableDriverSockets.length} available ${vehicleType} drivers`
    );

    /* ------------------------------------------------------------------ */
    /* 4. Distance filtering + enrichment                                  */
    /* ------------------------------------------------------------------ */
    const pickupCoords = {
      lat: booking.pickUp.coords.lat,
      lng: booking.pickUp.coords.lng,
    };

    const nearbyDrivers = availableDriverSockets
      .map((driverSocket: any) => {
        const driverLocation = driverSocket.data.location;

        if (!driverLocation) {
          console.log(`⚠️ Driver ${driverSocket.data.userId} has no location`);
          return null;
        }

        const distance = calculateDistance(pickupCoords, {
          lat: driverLocation.lat,
          lng: driverLocation.lng,
        });

        console.log(
          `📏 Driver ${driverSocket.data.userId} (${
            driverSocket.data.vehicleType
          }) is ${distance.toFixed(2)} km away`
        );

        if (distance > MAX_DRIVER_RADIUS_KM) return null;

        return {
          socket: driverSocket,
          distanceKm: Number(distance.toFixed(2)),
        };
      })
      .filter(Boolean) as {
      socket: any;
      distanceKm: number;
    }[];

    if (nearbyDrivers.length === 0) {
      socket.emit("no_drivers_available", {
        message: `No ${vehicleType} drivers available in your area`,
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 5. Join drivers to temporary room                                   */
    /* ------------------------------------------------------------------ */
    nearbyDrivers.forEach(({ socket }) => {
      socket.join(temporaryRoom);
    });

    console.log(
      `🚗 Added ${nearbyDrivers.length} ${vehicleType} drivers to room ${temporaryRoom}`
    );

    /* ------------------------------------------------------------------ */
    /* 6. Emit booking (driver-specific payload)                            */
    /* ------------------------------------------------------------------ */
    nearbyDrivers.forEach(({ socket, distanceKm }) => {
      socket.emit("new_booking_request", {
        _id: booking._id,
        bookingRef: booking.bookingRef,
        client: {
          id: client._id,
          name: client.fullName,
          profilePictureUrl: client.profilePictureUrl,
          phoneNumber: client.phoneNumber,
        },
        pickUp: booking.pickUp,
        dropOff: booking.dropOff,
        bookingType: booking.bookingType,
        routeData: booking.routeData,
        selectedVehicle: booking.selectedVehicle,
        addedServices: booking.addedServices,
        paymentMethod: booking.paymentMethod,
        note: booking.note,
        itemType: booking.itemType,
        photos: booking.photos,
        // 🔑 driver-specific metric
        distanceFromPickup: distanceKm,
      });
    });

    console.log(
      `📤 Booking ${data.bookingRef} dispatched to ${nearbyDrivers.length} ${vehicleType} drivers`
    );
  });
};

export const getDriverLocation = (socket: CustomSocket, io: Server) => {
  socket.on(
    "getDriverLocation",
    ({ bookingId, driverId }: { bookingId: string; driverId: string }) => {
      if (!bookingId || !driverId) return;

      const clientUserId = socket.userId;

      console.log("BOOKING ID: ", bookingId);

      console.log(`📡 Forwarding location request to driver ${driverId}`);

      // Forward request to driver
      io.to(driverId).emit("requestDriverLocation", {
        bookingId,
        clientUserId,
      });
    }
  );
};

export const pickDriver = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on(
    "acceptDriver",
    async (payload: { driverId: string; bookingId: string }) => {
      const { driverId, bookingId } = payload;

      console.log(
        `🚗 Customer attempting to pick driver ${driverId} for booking ${bookingId}`
      );

      // First, check if the booking exists and is pending
      const existingBooking = await BookingModel.findOne({
        _id: bookingId,
        status: "pending",
      });

      if (!existingBooking) {
        console.log("Booking not found or already accepted");
        socket.emit("error", {
          message: "Booking not found or already accepted",
        });
        return;
      }

      // Check if driver was actually in the requested drivers list
      const wasRequested = existingBooking.requestedDrivers.some(
        (id) => id.toString() === driverId.toString()
      );

      if (!wasRequested) {
        console.log("Driver offer was cancelled or not requested");
        socket.emit("error", {
          message:
            "This offer is no longer available. The driver may have cancelled it.",
        });
        return;
      }

      // Now proceed with the update
      const booking = await BookingModel.findOneAndUpdate(
        {
          _id: bookingId,
          status: "pending",
          requestedDrivers: new mongoose.Types.ObjectId(driverId),
        },
        {
          driverId,
          status: "active",
          acceptedAt: new Date(),
        },
        { new: true }
      );

      if (!booking) {
        // This would be a race condition - another driver accepted in the meantime
        console.log("Booking not found");
        socket.emit("error", {
          message: "Sorry, booking not found",
        });
        return;
      }
      // ✅ Confirm to customer
      socket.emit("driverAccepted", {
        bookingId,
      });

      // ✅ Notify all drivers who offered
      booking.requestedDrivers?.forEach((requestedDriverId) => {
        const requestedDriverIdStr = requestedDriverId.toString();

        if (requestedDriverIdStr === driverId) {
          // Accepted driver
          io.to(requestedDriverIdStr).emit("booking_confirmed", {
            bookingId,
          });
        } else {
          // Rejected drivers
          io.to(requestedDriverIdStr).emit("booking_taken", {
            bookingId,
          });
        }
      });

      //delete requested drivers
      // await BookingModel.updateOne(
      //   { _id: bookingId },
      //   { $set: { requestedDrivers: [] } }
      // );

      console.log(`✅ Booking ${bookingId} assigned to driver ${driverId}`);
    }
  );
};

export const cancelBooking = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("cancelBookingRequest", async (payload: { bookingId: string }) => {
    const { bookingId } = payload;

    console.log(`🚗 Customer attempting to cancel booking ${bookingId}`);

    const booking = await BookingModel.findOneAndUpdate(
      { _id: bookingId, status: "pending" },
      {
        status: "cancelled",
        cancelledAt: new Date(),
      },
      { new: true }
    );

    if (!booking) {
      console.log("Booking not found");
      socket.emit("error", {
        message: "Booking not found",
      });
      return;
    }

    // ✅ Confirm to customer
    socket.emit("bookingCancelled", {
      bookingId,
    });

    console.log(`✅ Booking ${bookingId} cancelled`);
  });
};
