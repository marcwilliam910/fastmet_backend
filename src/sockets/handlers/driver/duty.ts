import { withErrorHandling } from "../../../utils/socketWrapper";
import { CustomSocket } from "../../socket";
import BookingModel from "../../../models/Booking";
import { calculateDistance } from "../../../utils/helpers/distanceCalculator";
import { MAX_DRIVER_RADIUS_KM, SOCKET_ROOMS } from "../../../utils/constants";
import mongoose from "mongoose";
import UserModel from "../../../models/User";
import {
  expo,
  isValidPushToken,
  sendNotifToClient,
} from "../../../utils/pushNotifications";

export const toggleOnDuty = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);

  on(
    "toggleOnDuty",
    async (data: {
      isOnDuty: boolean;
      location?: { lat: number; lng: number };
      vehicleType?: "motorcycle" | "car" | "suv" | "truck";
    }) => {
      const { isOnDuty, location, vehicleType } = data;

      if (isOnDuty) {
        if (!location) {
          throw new Error("Location is required when going on duty");
        }

        if (!vehicleType) {
          throw new Error("Vehicle type is required when going on duty");
        }

        // Join general rooms
        socket.join(SOCKET_ROOMS.ON_DUTY);
        socket.join(SOCKET_ROOMS.AVAILABLE);

        // Join vehicle-specific room
        const vehicleRoom = `VEHICLE_${vehicleType.toUpperCase()}`;
        socket.join(vehicleRoom);

        socket.data.location = location;
        socket.data.vehicleType = vehicleType;
        socket.data.lastLocationUpdate = new Date();

        console.log(
          `✅ Driver ${socket.userId} is ON DUTY at`,
          location,
          `with vehicle: ${vehicleType}`
        );

        // // ✅ Fetch pending bookings
        // const pendingBookings = await BookingModel.find({
        //   status: "pending",
        // })
        //   .sort({ createdAt: -1 })
        //   .populate({
        //     path: "customerId",
        //     select: "fullName profilePictureUrl phoneNumber",
        //   })
        //   .lean();

        // // ✅ Filter by location radius AND vehicle type
        // const nearbyBookings = pendingBookings.filter((booking) => {
        //   // Check vehicle type match
        //   if (booking.selectedVehicle.id !== vehicleType) {
        //     return false;
        //   }

        //   // Check distance
        //   const distance = calculateDistance(
        //     {
        //       lat: booking.pickUp.coords.lat,
        //       lng: booking.pickUp.coords.lng,
        //     },
        //     {
        //       lat: location.lat,
        //       lng: location.lng,
        //     }
        //   );
        //   return distance <= MAX_DRIVER_RADIUS_KM;
        // });

        // console.log(
        //   `📦 Found ${nearbyBookings.length} nearby bookings for driver ${socket.userId} (${vehicleType})`
        // );

        const activeBooking = await BookingModel.findOne({
          status: "active",
          driverId: new mongoose.Types.ObjectId(socket.userId),
        })
          .populate({
            path: "customerId",
            select: "fullName profilePictureUrl phoneNumber",
          })
          .lean();

        let formattedActiveBooking = null;

        if (activeBooking) {
          // Rename userId to client
          const { customerId, ...rest } = activeBooking as any;
          formattedActiveBooking = {
            ...rest,
            client: {
              id: customerId._id,
              name: customerId.fullName,
              profilePictureUrl: customerId.profilePictureUrl,
              phoneNumber: customerId.phoneNumber,
            },
          };
        }

        // let formattedPendingBookings = nearbyBookings.map((booking) => {
        //   const { customerId, ...rest } = booking as any;
        //   return {
        //     ...rest,
        //     client: {
        //       id: customerId._id,
        //       name: customerId.fullName,
        //       profilePictureUrl: customerId.profilePictureUrl,
        //       phoneNumber: customerId.phoneNumber,
        //     },
        //   };
        // });

        socket.emit("dutyStatusChanged", {
          isOnDuty: true,
          // pendingBookings: formattedPendingBookings,
          activeBooking: formattedActiveBooking,
        });
      } else {
        // Leave all driver rooms
        socket.leave(SOCKET_ROOMS.ON_DUTY);
        socket.leave(SOCKET_ROOMS.AVAILABLE);

        // Leave vehicle-specific room if it exists
        if (socket.data.vehicleType) {
          const vehicleRoom = `VEHICLE_${socket.data.vehicleType.toUpperCase()}`;
          socket.leave(vehicleRoom);
        }

        // Clear driver data
        delete socket.data.location;
        delete socket.data.vehicleType;
        delete socket.data.lastLocationUpdate;

        console.log(`❌ Driver ${socket.userId} is OFF DUTY`);
        socket.emit("dutyStatusChanged", { isOnDuty });
      }
    }
  );
};

// Update driver location periodically
export const updateDriverLocation = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);

  on("updateLocation", async (location: { lat: number; lng: number }) => {
    // ✅ Check room membership instead of socket.data
    if (!socket.rooms.has(SOCKET_ROOMS.ON_DUTY)) {
      socket.emit("error", { message: "Driver must be on duty" });
      return;
    }

    socket.data.location = location;
    socket.data.lastLocationUpdate = new Date();
    const vehicleType = socket.data.vehicleType;

    // ✅ Fetch pending bookings
    const pendingBookings = await BookingModel.find({
      status: "pending",
    })
      .sort({ createdAt: -1 })
      .populate({
        path: "customerId",
        select: "fullName profilePictureUrl phoneNumber",
      })
      .lean();

    // ✅ Filter by NEW location radius
    const nearbyBookings = pendingBookings.filter((booking) => {
      if (booking.selectedVehicle.id !== vehicleType) {
        return false;
      }
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

    const formattedPendingBookings = nearbyBookings.map((booking) => {
      const { customerId, ...rest } = booking as any;
      return {
        ...rest,
        client: {
          id: customerId._id,
          name: customerId.fullName,
          profilePictureUrl: customerId.profilePictureUrl,
          phoneNumber: customerId.phoneNumber,
        },
      };
    });

    console.log(
      `📦 Driver ${socket.userId} now has ${nearbyBookings.length} nearby bookings`
    );

    // ✅ Send updated bookings list
    socket.emit("pendingBookingsUpdated", {
      bookings: formattedPendingBookings,
    });
  });
};

export const setDriverAvailable = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);
  on(
    "setAvailability",
    async (data: {
      bookingId: string;
      proofImageUrl: string;
      clientId: string;
    }) => {
      socket.join(SOCKET_ROOMS.AVAILABLE);
      console.log(`✅ Driver ${socket.userId} joined AVAILABLE room`);

      await BookingModel.findOneAndUpdate(
        { _id: data.bookingId },
        {
          status: "completed",
          completedAt: new Date(),
          proofImageUrl: data.proofImageUrl,
        },
        { new: true }
      );

      // ✅ Send push notification to the client
      await sendNotifToClient(
        data.clientId,
        "📦 Delivery Completed!",
        "Your package has been delivered successfully. Tap to view proof of delivery.",
        {
          // bookingId: data.bookingId,
          type: "booking_completed",
        }
      );

      // ✅ Fetch pending bookings
      const pendingBookings = await BookingModel.find({
        status: "pending",
      })
        .sort({ createdAt: -1 })
        .populate({
          path: "customerId",
          select: "fullName profilePictureUrl phoneNumber",
        })
        .lean();

      const location = socket.data.location;
      const vehicleType = socket.data.vehicleType;

      if (!location) {
        throw new Error("Location is required when going on duty");
      }

      // ✅ Filter by location radius
      const nearbyBookings = pendingBookings.filter((booking) => {
        if (booking.selectedVehicle.id !== vehicleType) {
          return false;
        }

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

      const formattedPendingBookings = nearbyBookings.map((booking) => {
        const { customerId, ...rest } = booking as any;
        return {
          ...rest,
          client: {
            id: customerId._id,
            name: customerId.fullName,
            profilePictureUrl: customerId.profilePictureUrl,
            phoneNumber: customerId.phoneNumber,
          },
        };
      });

      console.log(
        `📦 Found ${nearbyBookings.length} nearby bookings for driver ${socket.userId}`
      );

      socket.emit("availabilityChanged", {
        pendingBookings: formattedPendingBookings,
      });
    }
  );
};
