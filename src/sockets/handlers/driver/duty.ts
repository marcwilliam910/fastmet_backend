import { withErrorHandling } from "../../../utils/socketWrapper";
import { CustomSocket } from "../../socket";
import BookingModel from "../../../models/Booking";
import { calculateDistance } from "../../../utils/distanceCalculator";
import { MAX_DRIVER_RADIUS_KM, SOCKET_ROOMS } from "../../../utils/constants";

export const toggleOnDuty = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);

  on(
    "toggleOnDuty",
    async (data: {
      isOnDuty: boolean;
      location?: { lat: number; lng: number };
    }) => {
      const { isOnDuty, location } = data;

      if (isOnDuty) {
        if (!location) {
          throw new Error("Location is required when going on duty");
        }

        socket.join(SOCKET_ROOMS.ON_DUTY);
        socket.join(SOCKET_ROOMS.AVAILABLE);

        socket.data.location = location;
        socket.data.lastLocationUpdate = new Date();

        console.log(`✅ Driver ${socket.userId} is ON DUTY at`, location);

        // ✅ Fetch pending bookings
        const pendingBookings = await BookingModel.find({
          status: "pending",
        }).sort({ createdAt: -1 });

        // ✅ Filter by location radius
        const nearbyBookings = pendingBookings.filter((booking) => {
          const distance = calculateDistance(
            {
              lat: booking.pickUp.coords.lat,
              lng: booking.pickUp.coords.lng,
            },
            {
              lat: location.lat,
              lng: location.lng,
            }
          );
          return distance <= MAX_DRIVER_RADIUS_KM;
        });

        console.log(
          `📦 Found ${nearbyBookings.length} nearby bookings for driver ${socket.userId}`
        );

        socket.emit("dutyStatusChanged", {
          isOnDuty: true,
          pendingBookings: nearbyBookings,
        });
      } else {
        // Leave all driver rooms
        socket.leave(SOCKET_ROOMS.ON_DUTY);
        socket.leave(SOCKET_ROOMS.AVAILABLE);

        // Clear driver data
        delete socket.data.location;
        delete socket.data.lastLocationUpdate;

        console.log(`❌ Driver ${socket.userId} is OFF DUTY`);
        socket.emit("dutyStatusChanged", { isOnDuty });
      }
    }
  );
};

// Update driver location periodically
export const updateDriverLocation = (socket: CustomSocket) => {
  socket.on(
    "updateLocation",
    async (location: { lat: number; lng: number }) => {
      // ✅ Check room membership instead of socket.data
      if (!socket.rooms.has(SOCKET_ROOMS.ON_DUTY)) {
        socket.emit("error", { message: "Driver must be on duty" });
        return;
      }

      socket.data.location = location;
      socket.data.lastLocationUpdate = new Date();

      // ✅ Fetch pending bookings
      const pendingBookings = await BookingModel.find({
        status: "pending",
      }).sort({ createdAt: -1 });

      // ✅ Filter by NEW location radius
      const nearbyBookings = pendingBookings.filter((booking) => {
        const distance = calculateDistance(
          {
            lat: booking.pickUp.coords.lat,
            lng: booking.pickUp.coords.lng,
          },
          {
            lat: location.lat,
            lng: location.lng,
          }
        );
        return distance <= MAX_DRIVER_RADIUS_KM;
      });

      console.log(
        `📦 Driver ${socket.userId} now has ${nearbyBookings.length} nearby bookings`
      );

      // ✅ Send updated bookings list
      socket.emit("pendingBookingsUpdated", { bookings: nearbyBookings });
    }
  );
};

// Mark driver as unavailable when they accept a booking
export const setDriverAvailable = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);
  on(
    "setAvailability",
    async (data: { isAvailable: boolean; bookingId: string }) => {
      socket.join(SOCKET_ROOMS.AVAILABLE);
      console.log(`✅ Driver ${socket.userId} joined AVAILABLE room`);

      await BookingModel.findOneAndUpdate(
        { _id: data.bookingId },
        { status: "completed", completedAt: new Date() },
        { new: true }
      );

      // ✅ Fetch pending bookings
      const pendingBookings = await BookingModel.find({
        status: "pending",
      }).sort({ createdAt: -1 });

      const location = socket.data.location;

      if (!location) {
        throw new Error("Location is required when going on duty");
      }

      // ✅ Filter by location radius
      const nearbyBookings = pendingBookings.filter((booking) => {
        const distance = calculateDistance(
          {
            lat: booking.pickUp.coords.lat,
            lng: booking.pickUp.coords.lng,
          },
          {
            lat: location.lat,
            lng: location.lng,
          }
        );
        return distance <= MAX_DRIVER_RADIUS_KM;
      });

      console.log(
        `📦 Found ${nearbyBookings.length} nearby bookings for driver ${socket.userId}`
      );

      socket.emit("availabilityChanged", {
        pendingBookings: nearbyBookings,
      });
    }
  );
};
