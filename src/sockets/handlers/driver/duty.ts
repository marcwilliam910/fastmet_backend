import { withErrorHandling } from "../../../utils/socketWrapper";
import { CustomSocket } from "../../socket";
import BookingModel from "../../../models/Booking";
import { calculateDistance } from "../../../utils/helpers/distanceCalculator";
import { SOCKET_ROOMS } from "../../../utils/constants";
import mongoose from "mongoose";
import { sendNotifToClient } from "../../../utils/pushNotifications";
import DriverModel from "../../../models/Driver";
import { getLateBoundary } from "../../../utils/helpers/date";
import {
  checkScheduleConflict,
  refreshDriverBookings,
} from "../../../utils/helpers/bookingHelpers";

export const toggleOnDuty = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);

  on(
    "toggleOnDuty",
    async (data: {
      isOnDuty: boolean;
      location?: { lat: number; lng: number };
      vehicleType?: string;
    }) => {
      const { isOnDuty, location, vehicleType } = data;

      if (isOnDuty) {
        // Defensive: Require both location and vehicleType when going on duty
        if (!location) {
          socket.emit("error", {
            message: "Location is required when going on duty",
          });
          return;
        }
        if (!vehicleType) {
          socket.emit("error", {
            message: "Vehicle type is required when going on duty",
          });
          return;
        }

        // Fetch and cache driver data once on duty-start
        const driver = await DriverModel.findById(socket.data.userId)
          .select("serviceAreas vehicle vehicleVariant")
          .lean();

        if (!driver) {
          socket.emit("error", { message: "You are not a driver" });
          return;
        }

        if (!driver.vehicle) {
          socket.emit("error", { message: "You have no vehicle assigned" });
          return;
        }

        // Join required socket rooms
        socket.join(SOCKET_ROOMS.ON_DUTY);
        socket.join(SOCKET_ROOMS.AVAILABLE);

        // Join vehicle-specific room
        const vehicleRoom = `VEHICLE_${vehicleType.toUpperCase()}`;
        socket.join(vehicleRoom);

        // Store driver's session data
        socket.data.location = location;
        socket.data.vehicleType = vehicleType;
        socket.data.serviceAreas = driver.serviceAreas || [];
        socket.data.vehicle = driver.vehicle;
        socket.data.vehicleVariant = driver.vehicleVariant;

        console.log(socket.data);

        console.log(
          `✅ Driver ${socket.data.userId} is ON DUTY at`,
          location,
          `with vehicle: ${vehicleType}`,
        );

        // Find driver's current active booking, if any
        const activeBooking = await BookingModel.findOne({
          status: "active",
          driverId: new mongoose.Types.ObjectId(socket.data.userId),
        })
          .populate({
            path: "customerId",
            select: "fullName profilePictureUrl phoneNumber gender",
          })
          .populate({
            path: "selectedVehicle.vehicleTypeId",
            select: "name freeServices",
          })
          .lean();

        let formattedActiveBooking = null;

        if (activeBooking && activeBooking.customerId) {
          const { customerId, selectedVehicle, ...rest } = activeBooking as any;
          formattedActiveBooking = {
            ...rest,
            client: {
              id: customerId._id,
              name: customerId.fullName,
              profilePictureUrl: customerId.profilePictureUrl,
              phoneNumber: customerId.phoneNumber,
              gender: customerId.gender,
            },
            selectedVehicle: {
              freeServices: selectedVehicle?.vehicleTypeId?.freeServices || [],
            },
          };
        }

        socket.emit("dutyStatusChanged", {
          isOnDuty: true,
          activeBooking: formattedActiveBooking,
        });
      } else {
        // Leave all general and vehicle-specific rooms
        socket.leave(SOCKET_ROOMS.ON_DUTY);
        socket.leave(SOCKET_ROOMS.AVAILABLE);

        if (socket.data.vehicleType) {
          const vehicleRoom = `VEHICLE_${socket.data.vehicleType.toUpperCase()}`;
          socket.leave(vehicleRoom);
        }

        // Clear driver-specific session data
        delete socket.data.location;
        delete socket.data.vehicleType;

        console.log(`❌ Driver ${socket.data.userId} is OFF DUTY`);
        socket.emit("dutyStatusChanged", { isOnDuty });
      }
    },
  );
};

export const updateDriverLocation = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);

  on("updateLocation", async (location: { lat: number; lng: number }) => {
    if (!socket.rooms.has(SOCKET_ROOMS.ON_DUTY)) {
      socket.emit("error", { message: "Driver must be on duty" });
      return;
    }

    socket.data.location = location;
    await refreshDriverBookings(socket, location);
  });
};

export const setDriverAvailable = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);

  on(
    "setAvailability",
    async (data: { bookingId: string; clientId: string }) => {
      socket.join(SOCKET_ROOMS.AVAILABLE);

      if (!data.bookingId || !data.clientId) {
        socket.emit("error", { message: "Missing bookingId or clientId" });
        return;
      }

      // Complete booking
      const updatedBooking = await BookingModel.findOneAndUpdate(
        { _id: data.bookingId },
        { status: "completed", completedAt: new Date() },
        { new: true },
      );

      if (!updatedBooking) {
        socket.emit("error", { message: "Booking not found or not updated" });
        return;
      }

      // Notify client
      await sendNotifToClient(
        data.clientId,
        "📦 Delivery Completed!",
        "Your package has been delivered successfully. Tap to view proof of delivery.",
        { type: "booking_completed" },
      );

      // Reuse shared logic
      if (!socket.data.location) {
        socket.emit("error", {
          message: "Driver not ready for availability update",
        });
        return;
      }

      await refreshDriverBookings(socket, socket.data.location);
    },
  );
};
