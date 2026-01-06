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

    // 1. Save booking to DB
    const booking = await BookingModel.create({
      ...data,
      status: "pending",
    });

    const client = await UserModel.findById(booking.customerId)
      .select("name profilePictureUrl phoneNumber email")
      .lean();

    if (!client) {
      socket.emit("booking_request_saved", {
        success: false,
        error: "Client not found",
      });
      return;
    }

    const temporaryRoom = `BOOKING_${booking._id}`;

    // Confirm booking was saved
    socket.emit("booking_request_saved", { success: true });
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
    const vehicleType = booking.selectedVehicle.id;

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
      `🔍 Found ${availableDriverSockets.length} available ${vehicleType} drivers`
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
        }
      );

      console.log(
        `📏 Driver ${driverSocket.data.userId} (${
          driverSocket.data.vehicleType
        }) is ${distance.toFixed(2)} km away`
      );

      return distance <= MAX_DRIVER_RADIUS_KM;
    });

    if (nearbyDrivers.length === 0) {
      socket.emit("no_drivers_available", {
        message: `No ${vehicleType} drivers available in your area`,
      });
      return;
    }

    console.log(
      `🚗 Adding ${nearbyDrivers.length} ${vehicleType} drivers to ${temporaryRoom}`
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
      `📤 Booking ${booking._id} sent to ${nearbyDrivers.length} ${vehicleType} drivers in room ${temporaryRoom}`
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
