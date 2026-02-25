import { Server } from "socket.io";
import { CustomSocket } from "../../socket";
import BookingModel, { IBooking } from "../../../models/Booking";
import { withErrorHandling } from "../../../utils/socketWrapper";
import { SOCKET_ROOMS } from "../../../utils/constants";
import {
  canAcceptAsapBooking,
  canAcceptScheduledBooking,
  refreshDriverBookings,
} from "../../../utils/helpers/bookingHelpers";
import mongoose from "mongoose";
import { sendNotifToClient } from "../../../utils/pushNotifications";
import DriverModel from "../../../models/Driver";
import NotificationModel from "../../../models/Notification";

export const driverLocation = (socket: CustomSocket, io: Server) => {
  socket.on(
    "driverLocation",
    ({
      clientUserId,
      bookingId,
      driverLoc,
    }: {
      clientUserId: string;
      bookingId: string;
      driverLoc: { lat: number; lng: number; heading: number };
    }) => {
      // Early validation
      if (
        !driverLoc ||
        !clientUserId ||
        !bookingId ||
        typeof driverLoc.lat !== "number" ||
        typeof driverLoc.lng !== "number" ||
        typeof driverLoc.heading !== "number"
      ) {
        return;
      }

      console.log(`📍 Sending driver location to client ${clientUserId}`);

      // Send location back to the client
      io.to(clientUserId).emit("driverLocationResponse", { driverLoc });
    },
  );
};

export const handleStartScheduledTrip = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);

  on(
    "startScheduledTrip",
    async (data: { bookingId: string; driverId: string }) => {
      const { bookingId, driverId } = data;

      if (!bookingId || !driverId) {
        socket.emit("startScheduledTripError", {
          message: "Missing required fields",
        });
        return;
      }

      console.log(`🚗 Driver ${driverId} starting scheduled trip ${bookingId}`);

      // Parallelize: Check for active booking and fetch the scheduled booking
      const [hasActive, booking] = await Promise.all([
        BookingModel.exists({
          driverId: new mongoose.Types.ObjectId(driverId),
          status: "active",
        }),
        BookingModel.findById(bookingId)
          .populate({
            path: "customerId",
            select: "fullName profilePictureUrl phoneNumber",
          })
          .populate({
            path: "selectedVehicle.vehicleTypeId",
            select: "name freeServices",
          })
          .lean(),
      ]);

      if (hasActive) {
        socket.emit("startScheduledTripError", {
          message: "You still have an active trip, please complete it first",
        });
        return;
      }

      if (!booking) {
        socket.emit("startScheduledTripError", {
          message: "Booking not found",
        });
        return;
      }

      // Verify it's the correct driver
      if (booking.driverId?.toString() !== driverId) {
        socket.emit("startScheduledTripError", {
          message: "This booking is not assigned to you",
        });
        return;
      }

      // Verify status is 'scheduled'
      if (booking.status !== "scheduled") {
        socket.emit("startScheduledTripError", {
          message: `Cannot start trip. Current status: ${booking.status}`,
        });
        return;
      }

      // Check if it's within the allowed time window (15 minutes before)
      const now = new Date();
      const scheduledTime = new Date(booking.bookingType.value);
      const minutesUntil = (scheduledTime.getTime() - now.getTime()) / 60000;

      if (minutesUntil > 15) {
        socket.emit("startScheduledTripError", {
          message: `Too early. You can start this trip ${Math.ceil(
            minutesUntil - 15,
          )} minutes from now.`,
        });
        return;
      }

      // Update status to active
      await BookingModel.updateOne(
        { _id: bookingId },
        {
          $set: {
            status: "active",
          },
        },
      );

      console.log(`✅ Trip ${bookingId} status changed: scheduled → active`);

      const { customerId, selectedVehicle, ...rest } = booking as any;

      const formattedBooking = {
        ...rest,
        client: {
          id: customerId._id,
          name: customerId.fullName,
          profilePictureUrl: customerId.profilePictureUrl,
          phoneNumber: customerId.phoneNumber,
        },
        selectedVehicle: {
          freeServices: selectedVehicle?.vehicleTypeId?.freeServices || [],
        },
      };

      socket.emit("scheduledTripStarted", {
        booking: formattedBooking,
      });

      await sendNotifToClient(
        customerId._id.toString(),
        "Scheduled Trip Started",
        "Your driver has started the scheduled trip and is on the way!",
        {
          bookingId: bookingId,
          type: "driver_started_scheduled_trip",
        },
      );

      // Get customerId for notification (already have it from booking above)
      // const customerId = booking.customerId;

      // if (customerId) {
      //   io.to(`customer_${customerId.toString()}`).emit("driverStarted", {
      //     bookingId: booking._id,
      //     message: "Your driver has started the trip and is on the way!",
      //   });
      // }
    },
  );
};

export const requestAcceptance = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on(
    "requestAcceptance",
    async (payload: {
      id: string; // driver ID
      bookingId: string;
      clientUserId: string;
      name: string;
      vehicleImage: string;
      distance: number;
      profilePicture: string;
      type: "asap" | "schedule" | "pooling";
    }) => {
      const { id: driverId, bookingId, clientUserId } = payload;

      if (!driverId || !bookingId || !clientUserId) {
        socket.emit("requestAcceptanceError", {
          message: "Missing required fields",
          bookingId,
        });
        return;
      }

      // Check if driver already offered for this booking (early return for spam prevention)
      const booking = await BookingModel.findById(bookingId)
        .populate({
          path: "selectedVehicle.vehicleTypeId",
          select: "name freeServices",
        })
        .lean();

      if (!booking) {
        socket.emit("requestAcceptanceError", {
          message: "Booking not found",
          bookingId,
        });
        return;
      }

      // Prevent spam: Check if driver already in requestedDrivers
      if (booking.requestedDrivers?.some((id) => id.toString() === driverId)) {
        return;
      }

      // Parallelize independent queries: scheduled bookings, driver info, and total bookings count
      const driverObjectId = new mongoose.Types.ObjectId(driverId);

      const [scheduledBookings, driver, totalBookings] = await Promise.all([
        BookingModel.find({
          $or: [
            {
              driverId: driverObjectId,
              status: "scheduled",
              "bookingType.type": "schedule",
            },
            {
              requestedDrivers: driverObjectId,
              status: "pending",
              driverId: null,
              "bookingType.type": "schedule",
            },
          ],
        }).lean(),
        DriverModel.findById(driverId).lean(),
        BookingModel.countDocuments({
          driverId: driverObjectId,
          status: "completed",
        }),
      ]);

      // Check feasibility (this function will fetch booking again, but it's needed for validation)
      // Type assertion needed because lean() returns FlattenMaps type which is compatible at runtime
      if (payload.type === "asap") {
        const result = await canAcceptAsapBooking(
          bookingId,
          scheduledBookings as any as IBooking[],
        );

        if (!result.ok) {
          socket.emit("requestAcceptanceError", {
            message: result.reason,
            bookingId,
          });
          return;
        }
      }

      if (payload.type === "schedule") {
        const result = await canAcceptScheduledBooking(
          bookingId,
          scheduledBookings as any as IBooking[],
        );
        if (!result.ok) {
          socket.emit("requestAcceptanceError", {
            message: result.reason,
            bookingId,
          });
          return;
        }
      }

      if (!driver) {
        socket.emit("requestAcceptanceError", {
          message: "Driver not found",
          bookingId,
        });
        return;
      }

      // Add driver to requestedDrivers array using $addToSet to prevent duplicates
      await BookingModel.findByIdAndUpdate(bookingId, {
        $addToSet: { requestedDrivers: driverId },
      });

      console.log(`🚗 Driver ${driverId} offered for booking ${bookingId}`);

      const driverPayload = {
        id: driverId,
        name: payload.name,
        vehicleImage: payload.vehicleImage,
        profilePicture: payload.profilePicture,
        totalBookings,
        rating: driver.rating.average,
      };

      // Emit to customer
      if (payload.type === "asap") {
        io.to(clientUserId).emit("acceptanceRequestedASAP", {
          ...driverPayload,
          distance: payload.distance,
        });
      } else if (payload.type === "schedule") {
        // Count existing drivers to generate dynamic message
        const existingNotification = await NotificationModel.findOne({
          userId: clientUserId,
          userType: "Client",
          type: "driver_offer",
          "data.bookingId": booking._id,
        });

        const existingDriverCount = existingNotification?.data?.drivers
          ? Object.keys(existingNotification.data.drivers).length
          : 0;

        const totalDrivers = existingDriverCount + 1;
        const notifMessage =
          totalDrivers === 1
            ? `${payload.name} has offered to handle your scheduled delivery`
            : `${totalDrivers} drivers have offered to handle your scheduled delivery`;

        const notification = await NotificationModel.findOneAndUpdate(
          {
            userId: clientUserId,
            userType: "Client",
            type: "driver_offer",
            "data.bookingId": booking._id,
          },
          {
            $set: {
              [`data.drivers.${driverId}`]: {
                driverName: payload.name,
                driverRating: driver.rating.average,
                driverProfilePicture: driver.profilePictureUrl,
              },
              message: notifMessage, // Update message dynamically
              isRead: false,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              userId: clientUserId,
              userType: "Client",
              title: "New Driver Offer",
              type: "driver_offer",
              "data.bookingId": booking._id,
              "data.pickUp": {
                name: booking.pickUp?.name,
                coords: booking.pickUp?.coords,
                address: booking.pickUp?.address,
              },
              "data.dropOff": {
                name: booking.dropOff?.name,
                coords: booking.dropOff?.coords,
                address: booking.dropOff?.address,
              },
            },
          },
          { upsert: true, new: true },
        );

        const unreadNotifications = await NotificationModel.countDocuments({
          userId: booking.customerId,
          userType: {
            $in: ["Client", "All"],
          },
          isRead: false,
        });

        // Send push notification
        await sendNotifToClient(
          clientUserId,
          "New Driver Offer",
          notifMessage,
          {
            bookingId: booking._id,
            type: "driver_offer",
          },
        );

        io.to(clientUserId).emit("acceptanceRequestedSchedule", {
          driverOffer: {
            ...driverPayload,
            bookingId,
          },
          unreadNotifications,
          notification,
        });

        console.log(
          `📩 Notification sent to client ${clientUserId} for driver offer`,
        );
      }

      // Confirm to driver
      socket.emit("offer_sent", {
        success: true,
        message: "Your offer has been sent to the customer",
        bookingId,
        type: payload.type,
      });
    },
  );
};

export const cancelOffer = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on(
    "cancelOffer",
    async (payload: {
      clientId: string;
      id: string;
      bookingId: string;
      bookingType?: "asap" | "schedule";
    }) => {
      const { clientId, id, bookingId, bookingType } = payload;

      console.log(payload);

      if (!clientId || !id || !bookingId) {
        socket.emit("offerCancelledConfirmedError", {
          bookingId,
          error: "Missing required fields",
        });
        return;
      }

      await BookingModel.updateOne(
        { _id: bookingId },
        { $pull: { requestedDrivers: id } },
      );

      const emitToDriver =
        bookingType === "schedule"
          ? "offerCancelledConfirmedSchedule"
          : "offerCancelledConfirmedAsap";
      const emitToClient =
        bookingType === "schedule"
          ? "offerCancelledSchedule"
          : "offerCancelledAsap";

      socket.emit(emitToDriver, { bookingId });

      io.to(clientId).emit(emitToClient, { driverId: id, bookingId });
    },
  );
};

export const arrivedAtPickup = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);

  on(
    "arrivedAtPickup",
    async (payload: { clientId: string; bookingId: string }) => {
      await sendNotifToClient(
        payload.clientId,
        "Driver Arrived at Pickup",
        "The driver has arrived at the pickup location. Please assist them with the delivery.",
        {
          bookingId: payload.bookingId,
          type: "driver_arrived_at_pickup",
        },
      );
    },
  );
};

export const startDriving = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);
  on(
    "startDriving",
    async (payload: { bookingId: string; driverId: string }) => {
      socket.leave(SOCKET_ROOMS.AVAILABLE);
    },
  );
};

export const updateDriverState = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);

  on(
    "updateDriverState",
    async ({
      serviceAreas,
      location,
    }: {
      serviceAreas: string[];
      location: { lat: number; lng: number };
    }) => {
      if (!socket.rooms.has(SOCKET_ROOMS.ON_DUTY)) {
        socket.emit("error", { message: "Driver must be on duty" });
        return;
      }

      // Guaranteed order — no race condition
      socket.data.serviceAreas = serviceAreas;
      socket.data.location = location;

      await refreshDriverBookings(socket, location);
    },
  );
};
