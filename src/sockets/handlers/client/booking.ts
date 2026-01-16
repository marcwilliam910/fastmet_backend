import { Socket, Server } from "socket.io";
import BookingModel from "../../../models/Booking";
import { withErrorHandling } from "../../../utils/socketWrapper";
import { CustomSocket } from "../../socket";
import { calculateDistance } from "../../../utils/helpers/distanceCalculator";
import { DRIVER_RADIUS_KM, SOCKET_ROOMS } from "../../../utils/constants";
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
    const pickupCoords = {
      lat: booking.pickUp.coords.lat,
      lng: booking.pickUp.coords.lng,
    };

    /* ------------------------------------------------------------------ */
    /* 3. Expanding radius search setup                                    */
    /* ------------------------------------------------------------------ */
    const INITIAL_RADIUS = DRIVER_RADIUS_KM; // 100m (starting radius)
    const RADIUS_INCREMENT = 0.2; // 100m (increase per iteration)
    const SEARCH_INTERVAL = 30000; // 30 seconds
    const MAX_RADIUS = 7; // 7km
    const MAX_ATTEMPTS = 35; // reaches 6.9km

    const notifiedDriverIds = new Set<string>();
    let currentRadius = INITIAL_RADIUS;
    let searchAttempts = 0;
    let searchInterval: NodeJS.Timeout | null = null;

    /* ------------------------------------------------------------------ */
    /* 4. Search function                                                  */
    /* ------------------------------------------------------------------ */
    const searchForDrivers = async () => {
      searchAttempts++;
      console.log(
        `🔍 Search attempt ${searchAttempts}: radius ${currentRadius}km`
      );

      // Fetch all available drivers
      const availableDriverSockets = await io
        .in(SOCKET_ROOMS.ON_DUTY)
        .in(SOCKET_ROOMS.AVAILABLE)
        .in(vehicleRoom)
        .fetchSockets();

      // Filter by distance and exclude already-notified drivers
      const nearbyDrivers = availableDriverSockets
        .map((driverSocket: any) => {
          const driverLocation = driverSocket.data.location;
          const driverId = driverSocket.data.userId;

          // Skip if already notified
          if (notifiedDriverIds.has(driverId)) {
            return null;
          }

          if (!driverLocation) {
            console.log(`⚠️ Driver ${driverId} has no location`);
            return null;
          }

          const distance = calculateDistance(pickupCoords, {
            lat: driverLocation.lat,
            lng: driverLocation.lng,
          });

          // Check if within current radius
          if (distance > currentRadius) return null;

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

      // Notify new drivers
      if (nearbyDrivers.length > 0) {
        nearbyDrivers.forEach(({ socket, driverId, distanceKm }) => {
          // Join temporary room
          socket.join(temporaryRoom);

          // Mark as notified
          notifiedDriverIds.add(driverId);

          // Send booking request
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
            distanceFromPickup: distanceKm,
          });
        });

        console.log(
          `📤 Dispatched to ${nearbyDrivers.length} new drivers (radius: ${currentRadius}km, total notified: ${notifiedDriverIds.size})`
        );
      } else {
        console.log(`📭 No new drivers found at ${currentRadius}km radius`);
      }

      // Expand radius for next iteration
      currentRadius = Number((currentRadius + RADIUS_INCREMENT).toFixed(2));

      // Stop conditions
      if (currentRadius > MAX_RADIUS || searchAttempts >= MAX_ATTEMPTS) {
        if (searchInterval) {
          clearInterval(searchInterval);
          searchInterval = null;
        }

        console.log(
          `🛑 Stopped expanding search for booking ${booking.bookingRef} (Total drivers notified: ${notifiedDriverIds.size})`
        );

        // Notify customer if no drivers found at all
        if (notifiedDriverIds.size === 0) {
          socket.emit("no_drivers_available", {
            message: `No ${vehicleType} drivers available in your area`,
          });
        }
      }
    };

    /* ------------------------------------------------------------------ */
    /* 5. Start search cycle                                               */
    /* ------------------------------------------------------------------ */
    // Immediate first search
    await searchForDrivers();

    // Continue searching every 30 seconds if needed
    if (currentRadius <= MAX_RADIUS && searchAttempts < MAX_ATTEMPTS) {
      searchInterval = setInterval(searchForDrivers, SEARCH_INTERVAL);

      // Store reference for cleanup
      socket.data.activeBookingSearch = {
        interval: searchInterval,
        bookingId: booking._id,
      };
    }
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

      // 🧹 Clear the expanding radius search interval
      if (socket.data.activeBookingSearch?.bookingId === bookingId) {
        clearInterval(socket.data.activeBookingSearch.interval);
        socket.data.activeBookingSearch = null;
        console.log(
          `🛑 Stopped expanding search for booking ${bookingId} (driver accepted)`
        );
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
          io.to(requestedDriverIdStr).emit("bookingConfirmed", {
            bookingId,
          });
        } else {
          // Rejected drivers
          io.to(requestedDriverIdStr).emit("bookingTaken", {
            bookingId,
          });
        }
      });

      // Notify all drivers in temporary room who haven't offered yet
      const temporaryRoom = `BOOKING_${bookingId}`;
      io.to(temporaryRoom).emit("bookingExpired", {
        bookingId,
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

    // 🧹 Clear the expanding radius search interval
    if (socket.data.activeBookingSearch?.bookingId === bookingId) {
      clearInterval(socket.data.activeBookingSearch.interval);
      socket.data.activeBookingSearch = null;
      console.log(
        `🛑 Stopped expanding search for booking ${bookingId} (cancelled)`
      );
    }

    // ✅ Confirm to customer
    socket.emit("bookingCancelled", {
      bookingId,
    });

    // ✅ Notify all drivers in the temporary room
    const temporaryRoom = `BOOKING_${bookingId}`;
    io.to(temporaryRoom).emit("bookingCancelled", {
      bookingId,
    });

    // Remove the requestedDrivers loop entirely

    console.log(`✅ Booking ${bookingId} cancelled`);
  });
};
