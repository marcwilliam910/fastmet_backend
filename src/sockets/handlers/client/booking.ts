import { Socket, Server } from "socket.io";
import BookingModel from "../../../models/Booking";
import { withErrorHandling } from "../../../utils/socketWrapper";
import { CustomSocket } from "../../socket";
import { SOCKET_ROOMS } from "../../../constants/socketRooms";
import { calculateDistance } from "../../../utils/distanceCalculator";
import { MAX_DRIVER_RADIUS_KM } from "../../../utils/constants";

// export const handleBookingSocket = (socket: Socket, io: Server) => {
//   socket.on("request_booking", async (data) => {
//     console.log("Booking request received:", JSON.stringify(data, null, 2));

//     try {
//       // 1. Save booking to DB
//       const booking = await BookingModel.create({
//         ...data,
//         status: "pending",
//       });

//       // 2. Prepare payload for drivers
//       const driverPayload = {
//         _id: booking._id,
//         pickUp: booking.pickUp,
//         dropOff: booking.dropOff,
//         bookingType: booking.bookingType,
//         routeData: booking.routeData,
//         selectedVehicle: booking.selectedVehicle,
//         addedServices: booking.addedServices,
//         paymentMethod: booking.paymentMethod,
//       };

//       // 3. Emit to drivers (can later filter by nearest driver)
//       io.emit("new_booking_request", driverPayload);
//     } catch (err) {
//       console.error("Error saving booking:", err);
//       socket.emit("booking_error", { message: "Failed to request booking" });
//     }
//   });
// };

export const handleBookingSocket = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("request_booking", async (data) => {
    console.log("📨 Booking request received:", data);

    // 1. Save booking to DB
    const booking = await BookingModel.create({
      ...data,
      status: "pending",
    });

    const temporaryRoom = `BOOKING_${booking._id}`;

    // Confirm booking was saved
    socket.emit("booking_request_saved", { success: true });

    // 2. Payload
    const driverPayload = {
      bookingId: booking._id,
      pickUp: booking.pickUp,
      dropOff: booking.dropOff,
      bookingType: booking.bookingType,
      routeData: booking.routeData,
      selectedVehicle: booking.selectedVehicle,
      addedServices: booking.addedServices,
      paymentMethod: booking.paymentMethod,
    };

    // 3. Get available & on-duty drivers
    const availableDriverSockets = await io
      .in(SOCKET_ROOMS.ON_DUTY)
      .in(SOCKET_ROOMS.AVAILABLE)
      .fetchSockets();

    console.log(`🔍 Found ${availableDriverSockets.length} available drivers`);

    // 4. Location filtering
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
        }
      );

      console.log(
        `📏 Driver ${driverSocket.data.userId} is ${distance.toFixed(
          2
        )} km away`
      );

      return distance <= MAX_DRIVER_RADIUS_KM;
    });

    if (nearbyDrivers.length === 0) {
      socket.emit("no_drivers_available", {
        message: "No drivers available in your area",
      });
      return;
    }

    console.log(
      `🚗 Adding ${nearbyDrivers.length} drivers to ${temporaryRoom}`
    );

    // 5. Join nearby drivers to this booking room
    nearbyDrivers.forEach((driverSocket) => {
      driverSocket.join(temporaryRoom);
    });

    // 6. Emit booking to room
    io.to(temporaryRoom).emit("new_booking_request", driverPayload);

    // Notify client
    socket.emit("booking_request_sent", {
      bookingId: booking._id,
      driversNotified: nearbyDrivers.length,
    });

    console.log(`📤 Booking ${booking._id} sent to room ${temporaryRoom}`);
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
