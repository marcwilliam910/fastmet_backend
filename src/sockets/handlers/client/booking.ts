import { Socket, Server } from "socket.io";
import BookingModel from "../../../models/Booking";
import { withErrorHandling } from "../../../utils/socketWrapper";
import { CustomSocket } from "../../socket";
import { calculateDistance } from "../../../utils/helpers/distanceCalculator";
import {
  DRIVER_RADIUS_KM,
  SEARCH_CONFIG,
  SOCKET_ROOMS,
} from "../../../utils/constants";
import UserModel from "../../../models/User";
import { RequestBooking } from "../../../types/booking";
import mongoose from "mongoose";

export const bookingTimers = new Map<string, NodeJS.Timeout>();

export const requestAsapBooking = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("request_asap_booking", async (data: RequestBooking) => {
    console.log("📨 Booking request received:", data);

    /* ------------------------------------------------------------------ */
    /* 1. Create booking (searching immediately)                           */
    /* ------------------------------------------------------------------ */
    const vehicleType = data.selectedVehicle?.key;

    if (!vehicleType || !SEARCH_CONFIG[vehicleType]) {
      socket.emit("bookingRequestFailed", {
        message: "Invalid vehicle type",
      });
      return;
    }

    const { initialRadiusKm } = SEARCH_CONFIG[vehicleType];

    const booking = await BookingModel.create({
      ...data,
      status: "searching",
      searchStep: 1,
      currentRadiusKm: initialRadiusKm,
    });

    const client = await UserModel.findById(booking.customerId)
      .select("fullName profilePictureUrl phoneNumber email")
      .lean();

    if (!client) {
      socket.emit("bookingRequestFailed", {
        message: "Client not found",
      });
      return;
    }

    socket.emit("bookingRequestSaved", {
      success: true,
      bookingId: booking._id,
      message: "Booking request saved successfully",
    });

    /* ------------------------------------------------------------------ */
    /* 2. START 10-MINUTE ABSOLUTE TIMEOUT                                 */
    /* ------------------------------------------------------------------ */
    const timeoutTimer = setTimeout(
      async () => {
        console.log(`⏰ Booking ${booking._id} reached 10-minute timeout`);

        const freshBooking = await BookingModel.findById(booking._id);

        if (freshBooking && freshBooking.status === "searching") {
          // Delete the booking
          await BookingModel.findByIdAndDelete(booking._id);

          // Notify the customer
          socket.emit("bookingExpired", {
            message: "Your booking request has expired",
          });

          // Notify all drivers in the temporary room
          const temporaryRoom = `BOOKING_${booking._id}`;
          io.to(temporaryRoom).emit("bookingExpired", {
            bookingId: booking._id,
          });

          // Cleanup room
          const socketsInRoom = await io.in(temporaryRoom).fetchSockets();
          socketsInRoom.forEach((s) => s.leave(temporaryRoom));

          console.log(
            `🗑️  Deleted booking ${booking._id} after 10 minutes timeout`,
          );
        }

        // Clean up timer
        bookingTimers.delete(String(booking._id));
      },
      10 * 60 * 1000,
    ); // 10 minutes

    // Store the timer
    bookingTimers.set(String(booking._id), timeoutTimer);
    console.log(`⏱️  Started 10-minute timer for booking ${booking._id}`);

    /* ------------------------------------------------------------------ */
    /* 3. Vehicle config & search logic                                    */
    /* ------------------------------------------------------------------ */
    const { incrementKm, maxRadiusKm, intervalMs } = SEARCH_CONFIG[vehicleType];
    const vehicleRoom = `VEHICLE_${vehicleType.toUpperCase()}`;
    const temporaryRoom = `BOOKING_${booking._id}`;

    const pickupCoords = {
      lat: booking.pickUp.coords.lat,
      lng: booking.pickUp.coords.lng,
    };

    /* ------------------------------------------------------------------ */
    /* 4. Recursive search step                                            */
    /* ------------------------------------------------------------------ */
    const driverList = new Set<string>();
    const runSearchStep = async () => {
      const freshBooking = await BookingModel.findById(booking._id);

      if (!freshBooking || freshBooking.status !== "searching") {
        return;
      }

      const radiusKm = freshBooking.currentRadiusKm;

      console.log(
        `🔍 Search step ${freshBooking.searchStep} | radius ${radiusKm}km`,
      );

      socket.emit("radiusExpansion", {
        radiusKm,
        attempt: freshBooking.searchStep,
      });

      const availableDriverSockets = await io
        .in(SOCKET_ROOMS.ON_DUTY)
        .in(SOCKET_ROOMS.AVAILABLE)
        .in(vehicleRoom)
        .fetchSockets();

      const newDrivers = availableDriverSockets
        .map((driverSocket: any) => {
          const driverLocation = driverSocket.data.location;
          const driverId = driverSocket.data.userId;

          if (!driverLocation) return null;
          if (driverList.has(driverId)) return null;

          const distance = calculateDistance(pickupCoords, {
            lat: driverLocation.lat,
            lng: driverLocation.lng,
          });

          console.log(driverSocket.id + " = " + distance);

          if (distance > radiusKm) return null;

          return {
            socket: driverSocket,
            driverId,
            distanceKm: Number(distance.toFixed(2)),
          };
        })
        .filter(Boolean) as {
        socket: any;
        driverId: string;
        distanceKm: number;
      }[];

      if (newDrivers.length > 0) {
        newDrivers.map((d) => driverList.add(d.driverId));

        newDrivers.forEach(({ socket, distanceKm }) => {
          socket.join(temporaryRoom);

          socket.emit("new_booking_request", {
            _id: freshBooking._id,
            bookingRef: freshBooking.bookingRef,
            client: {
              id: client._id,
              name: client.fullName,
              profilePictureUrl: client.profilePictureUrl,
              phoneNumber: client.phoneNumber,
            },
            pickUp: freshBooking.pickUp,
            dropOff: freshBooking.dropOff,
            bookingType: freshBooking.bookingType,
            routeData: freshBooking.routeData,
            selectedVehicle: freshBooking.selectedVehicle,
            addedServices: freshBooking.addedServices,
            paymentMethod: freshBooking.paymentMethod,
            note: freshBooking.note,
            itemType: freshBooking.itemType,
            photos: freshBooking.photos,
            distanceFromPickup: distanceKm,
          });
        });

        console.log(
          `📤 Sent to ${newDrivers.length} drivers (radius ${radiusKm}km)`,
        );
      }

      const nextRadius = Number((radiusKm + incrementKm).toFixed(2));

      if (nextRadius > maxRadiusKm) {
        console.log(
          `🛑 Max radius reached for booking ${freshBooking.bookingRef}`,
        );
        return;
      }

      await BookingModel.findByIdAndUpdate(freshBooking._id, {
        $inc: { searchStep: 1 },
        $set: { currentRadiusKm: nextRadius },
      });

      setTimeout(runSearchStep, intervalMs);
    };

    /* ------------------------------------------------------------------ */
    /* 5. Start first search                                               */
    /* ------------------------------------------------------------------ */
    await runSearchStep();
  });
};

export const requestScheduleBooking = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("request_schedule_booking", async (data) => {
    console.log("📨 Booking request received:", data);

    // 1. Save booking to DB
    const booking = await BookingModel.create({
      ...data,
      status: "pending",
    });

    const client = await UserModel.findById(booking.customerId)
      .select("fullName profilePictureUrl phoneNumber email")
      .lean();

    if (!client) {
      socket.emit("bookingRequestFailed", {
        message: "Client not found",
      });
      return;
    }

    const temporaryRoom = `BOOKING_${booking._id}`;

    // Confirm booking was saved
    socket.emit("bookingRequestSaved", {
      success: true,
      bookingId: booking._id,
      message: "You will be notified when a driver accepts your request.",
    });

    // 2. Payload
    const driverPayload = {
      client: {
        id: client._id,
        name: client.fullName,
        profilePictureUrl: client.profilePictureUrl,
        phoneNumber: client.phoneNumber,
      },
      bookingId: booking._id,
      pickUp: booking.pickUp,
      dropOff: booking.dropOff,
      bookingType: booking.bookingType,
      routeData: booking.routeData,
      selectedVehicle: booking.selectedVehicle,
      addedServices: booking.addedServices,
      paymentMethod: booking.paymentMethod,
    };

    // 3. Determine vehicle type from booking
    const vehicleType = booking.selectedVehicle.key;

    if (!vehicleType) {
      socket.emit("booking_request_failed", {
        message: "Vehicle type not specified in booking",
      });
      return;
    }

    const vehicleRoom = `VEHICLE_${vehicleType.toUpperCase()}`;

    // 4. Get available & on-duty drivers with matching vehicle type
    const availableDriverSockets = await io
      .in(SOCKET_ROOMS.ON_DUTY)
      .in(SOCKET_ROOMS.AVAILABLE)
      .in(vehicleRoom)
      .fetchSockets();

    console.log(
      `🔍 Found ${availableDriverSockets.length} available ${vehicleType} drivers`,
    );

    // 5. Location filtering
    const nearbyDrivers = availableDriverSockets.filter((driverSocket: any) => {
      const driverLocation = driverSocket.data.location;
      if (!driverLocation) {
        console.log(`⚠️ Driver ${driverSocket.data.userId} has no location`);
        return false;
      }

      const distance = calculateDistance(
        {
          lat: booking.pickUp.coords.lat,
          lng: booking.pickUp.coords.lng,
        },
        {
          lat: driverLocation.lat,
          lng: driverLocation.lng,
        },
      );

      console.log(
        `📏 Driver ${driverSocket.data.userId} (${
          driverSocket.data.vehicleType
        }) is ${distance.toFixed(2)} km away`,
      );

      return distance <= DRIVER_RADIUS_KM;
    });

    if (nearbyDrivers.length === 0) {
      socket.emit("no_drivers_available", {
        message: `No ${vehicleType} drivers available in your area`,
      });
      return;
    }

    console.log(
      `🚗 Adding ${nearbyDrivers.length} ${vehicleType} drivers to ${temporaryRoom}`,
    );

    // 6. Join nearby drivers to this booking room
    nearbyDrivers.forEach((driverSocket) => {
      driverSocket.join(temporaryRoom);
    });

    // 7. Emit booking to room
    io.to(temporaryRoom).emit("new_booking_request", driverPayload);

    // Notify client (have available drivers)
    // socket.emit("booking_request_sent", {
    //   bookingId: booking._id,
    //   driversNotified: nearbyDrivers.length,
    //   vehicleType,
    // });

    console.log(
      `📤 Booking ${booking._id} sent to ${nearbyDrivers.length} ${vehicleType} drivers in room ${temporaryRoom}`,
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
    },
  );
};

export const pickDriver = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on(
    "acceptDriver",
    async (payload: {
      driverId: string;
      bookingId: string;
      type: "asap" | "schedule";
    }) => {
      const { driverId, bookingId } = payload;

      console.log(
        `🚗 Customer attempting to pick driver ${driverId} for booking ${bookingId}`,
      );

      // Check if the booking exists and is pending
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
        (id) => id.toString() === driverId.toString(),
      );

      if (!wasRequested) {
        console.log("Driver offer was cancelled or not requested");
        socket.emit("error", {
          message:
            "This offer is no longer available. The driver may have cancelled it.",
        });
        return;
      }

      // Update booking to active
      const booking = await BookingModel.findOneAndUpdate(
        {
          _id: bookingId,
          status: "pending",
          requestedDrivers: new mongoose.Types.ObjectId(driverId),
        },
        {
          driverId,
          status: payload.type === "asap" ? "active" : "scheduled",
          acceptedAt: new Date(),
        },
        { new: true },
      );

      if (!booking) {
        console.log("Booking not found");
        socket.emit("error", {
          message: "Sorry, booking not found",
        });
        return;
      }

      /* ------------------------------------------------------------------ */
      /* CLEAR THE TIMEOUT TIMER - Driver was accepted                      */
      /* ------------------------------------------------------------------ */
      const timer = bookingTimers.get(bookingId);
      if (timer) {
        clearTimeout(timer);
        bookingTimers.delete(bookingId);
        console.log(`⏹️  Cleared timeout timer for booking ${bookingId}`);
      }

      /* ------------------------------------------------------------------ */
      /* Notify customer and drivers                                        */
      /* ------------------------------------------------------------------ */
      const notifyCustomerSocket =
        payload.type === "asap" ? "driverAccepted" : "driverAcceptedSchedule";
      const notifyDriverAccepted =
        payload.type === "asap"
          ? "bookingConfirmed"
          : "bookingConfirmedSchedule";

      socket.emit(notifyCustomerSocket, { bookingId });

      booking.requestedDrivers?.forEach((requestedDriverId) => {
        const requestedDriverIdStr = requestedDriverId.toString();

        if (requestedDriverIdStr === driverId) {
          // Accepted driver
          io.to(requestedDriverIdStr).emit(notifyDriverAccepted, { bookingId });
        } else {
          // Rejected drivers
          io.to(requestedDriverIdStr).emit("bookingTaken", { bookingId });
        }
      });

      // Notify all drivers in temporary room who haven't offered yet
      const temporaryRoom = `BOOKING_${bookingId}`;
      io.to(temporaryRoom).emit("bookingExpired", { bookingId });

      /* ------------------------------------------------------------------ */
      /* CLEANUP: Remove all sockets from temporary room                    */
      /* ------------------------------------------------------------------ */
      const socketsInRoom = await io.in(temporaryRoom).fetchSockets();
      socketsInRoom.forEach((s) => s.leave(temporaryRoom));

      console.log(
        `🧹 Cleared ${socketsInRoom.length} sockets from ${temporaryRoom}`,
      );
      console.log(`✅ Booking ${bookingId} assigned to driver ${driverId}`);
    },
  );
};

export const cancelBooking = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("cancelBookingRequest", async (payload: { bookingId: string }) => {
    const { bookingId } = payload;

    console.log(`🚗 Customer attempting to cancel booking ${bookingId}`);

    const booking = await BookingModel.findOneAndUpdate(
      { _id: bookingId, status: "searching" },
      {
        status: "cancelled",
        cancelledAt: new Date(),
      },
      { new: true },
    );

    if (!booking) {
      console.log("Booking not found");
      socket.emit("error", {
        message: "Booking not found",
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* CLEAR THE TIMEOUT TIMER - Booking was cancelled                    */
    /* ------------------------------------------------------------------ */
    const timer = bookingTimers.get(bookingId);
    if (timer) {
      clearTimeout(timer);
      bookingTimers.delete(bookingId);
      console.log(`⏹️  Cleared timeout timer for booking ${bookingId}`);
    }

    /* ------------------------------------------------------------------ */
    /* Notify customer and drivers                                        */
    /* ------------------------------------------------------------------ */
    socket.emit("bookingCancelled", { bookingId });

    const temporaryRoom = `BOOKING_${bookingId}`;
    io.to(temporaryRoom).emit("bookingCancelled", { bookingId });

    /* ------------------------------------------------------------------ */
    /* CLEANUP: Remove all sockets from temporary room                    */
    /* ------------------------------------------------------------------ */
    const socketsInRoom = await io.in(temporaryRoom).fetchSockets();
    socketsInRoom.forEach((s) => s.leave(temporaryRoom));

    console.log(
      `🧹 Cleared ${socketsInRoom.length} sockets from ${temporaryRoom}`,
    );
    console.log(`✅ Booking ${bookingId} cancelled`);
  });
};
