import { Socket, Server } from "socket.io";
import BookingModel from "../../../models/Booking";
import { withErrorHandling } from "../../../utils/socketWrapper";
import { CustomSocket } from "../../socket";
import { calculateDistance } from "../../../utils/helpers/distanceCalculator";
import { MAX_DRIVER_RADIUS_KM, SOCKET_ROOMS } from "../../../utils/constants";
import UserModel from "../../../models/User";

export const handleBookingSocket = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("request_booking", async (data) => {
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
        error: "Client not found",
      });
      return;
    }

    const temporaryRoom = `BOOKING_${booking._id}`;

    socket.emit("booking_request_saved", { success: true });
    console.log("booking_request_saved called");

    /* ------------------------------------------------------------------ */
    /* 2. Vehicle filtering                                                */
    /* ------------------------------------------------------------------ */
    const vehicleType = booking.selectedVehicle?.key;

    if (!vehicleType) {
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
      `📤 Booking ${booking._id} dispatched to ${nearbyDrivers.length} ${vehicleType} drivers`
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
