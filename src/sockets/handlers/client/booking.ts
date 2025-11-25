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

    socket.emit("booking_request_saved", { success: true });

    // 2. Prepare payload
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

    // 3. Get drivers who are BOTH on-duty AND available
    const availableDriverSockets = await io
      .in(SOCKET_ROOMS.ON_DUTY)
      .in(SOCKET_ROOMS.AVAILABLE) // ✅ Drivers in BOTH rooms
      .fetchSockets();

    console.log(`🔍 Found ${availableDriverSockets.length} available drivers`);

    // 4. Filter by location (within radius)
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
        `📏 Driver ${driverSocket.data.userId} is ${distance.toFixed(2)}km away`
      );

      return distance <= MAX_DRIVER_RADIUS_KM;
    });

    console.log(`✅ Sending booking to ${nearbyDrivers.length} nearby drivers`);

    // 5. Emit to filtered drivers
    if (nearbyDrivers.length === 0) {
      // No drivers available
      socket.emit("no_drivers_available", {
        message: "No drivers available in your area",
      });
      return;
    }

    nearbyDrivers.forEach((driverSocket: any) => {
      driverSocket.emit("new_booking_request", driverPayload);
    });

    // Notify client
    socket.emit("booking_request_sent", {
      bookingId: booking._id,
      driversNotified: nearbyDrivers.length,
    });
  });
};
