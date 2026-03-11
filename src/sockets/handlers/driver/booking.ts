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
import PoolingTripModel from "../../../models/PoolingTrip";
import {
  AcceptPoolingPayload,
  AddToPoolingPayload,
  PoolingTripCompletedPayload,
  UpdatePoolingLocationPayload,
} from "../../../types/booking";
import {
  cheapestInsertionMidTrip,
  formatPoolingBooking,
  mapboxOptimizedMidTrip,
  OptimizedStop,
  PoolingStop,
} from "../../../utils/helpers/poolingHelper";
import { VehicleType } from "../../../models/Vehicle";
import { calculateDistance } from "../../../utils/helpers/distanceCalculator";

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
      driverLoc: { lat: number; lng: number };
    }) => {
      // Early validation
      if (
        !driverLoc ||
        !clientUserId ||
        !bookingId ||
        typeof driverLoc.lat !== "number" ||
        typeof driverLoc.lng !== "number"
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

      const now = new Date();
      const scheduledTime = new Date(booking.bookingType.value);
      const minutesUntil = (scheduledTime.getTime() - now.getTime()) / 60000;

      const ALLOWED_WINDOW_MINUTES = 120;

      if (minutesUntil > ALLOWED_WINDOW_MINUTES) {
        socket.emit("startScheduledTripError", {
          message: `Too early. You can start this trip ${Math.ceil(
            minutesUntil - ALLOWED_WINDOW_MINUTES,
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

      const haveActiveBooking = await BookingModel.exists({
        driverId: new mongoose.Types.ObjectId(driverId),
        status: "active",
      });

      if (haveActiveBooking) {
        socket.emit("requestAcceptanceError", {
          message: "You still have an active trip, please complete it first",
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

export const acceptPoolingBookings = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("acceptPoolingBookings", async (payload: AcceptPoolingPayload) => {
    const {
      driverId,
      bookingIds,
      stops,
      totalDistance,
      totalDuration,
      maxRequests,
    } = payload;

    /* ------------------------------------------------------------------ */
    /* 1. VALIDATE PAYLOAD                                                  */
    /* ------------------------------------------------------------------ */
    if (
      !driverId ||
      !bookingIds?.length ||
      !stops?.length ||
      !totalDistance ||
      !totalDuration
    ) {
      socket.emit("poolingError", { message: "Missing required fields" });
      return;
    }

    if (bookingIds.length > maxRequests) {
      socket.emit("poolingError", {
        message: `You can only accept up to ${maxRequests} bookings at a time`,
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 2. VALIDATE ALL BOOKINGS EXIST AND ARE STILL PENDING                */
    /* ------------------------------------------------------------------ */
    const bookingObjectIds = bookingIds.map(
      (id) => new mongoose.Types.ObjectId(id),
    );

    const bookings = await BookingModel.find({
      _id: { $in: bookingObjectIds },
      status: "pending",
      driverId: null,
    })
      .populate({
        path: "customerId",
        select: "fullName profilePictureUrl phoneNumber",
      })
      .populate({
        path: "selectedVehicle.vehicleTypeId",
        select: "name freeServices",
      })
      .lean();

    if (bookings.length !== bookingIds.length) {
      const foundIds = bookings.map((b) => b._id.toString());
      const missingOrTaken = bookingIds.filter((id) => !foundIds.includes(id));

      socket.emit("poolingError", {
        message:
          "One or more bookings are no longer available. Please refresh and try again.",
        unavailableBookingIds: missingOrTaken,
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 3. CHECK DRIVER DOESN'T ALREADY HAVE AN ACTIVE BOOKING             */
    /* ------------------------------------------------------------------ */
    const [existingTrip, haveActiveBooking] = await Promise.all([
      PoolingTripModel.exists({
        driverId: new mongoose.Types.ObjectId(driverId),
        status: "active",
      }),
      BookingModel.exists({
        driverId: new mongoose.Types.ObjectId(driverId),
        status: { $in: ["active", "picked_up"] },
      }),
    ]);

    if (existingTrip || haveActiveBooking) {
      socket.emit("poolingError", {
        message:
          "You already have an active trip or booking. Please complete it first.",
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 4. CREATE POOLING TRIP + BULK UPDATE BOOKINGS IN PARALLEL           */
    /* ------------------------------------------------------------------ */
    const driverObjectId = new mongoose.Types.ObjectId(driverId);

    const [poolingTrip] = await Promise.all([
      PoolingTripModel.create({
        driverId: driverObjectId,
        bookingIds: bookingObjectIds,
        stops: stops.map((stop) => ({
          ...stop,
          bookingId: new mongoose.Types.ObjectId(stop.bookingId),
        })),
        currentStopIndex: 0,
        status: "active",
        totalDistance,
        totalDuration,
      }),
      BookingModel.updateMany(
        {
          _id: { $in: bookingObjectIds },
          status: "pending",
          driverId: null,
        },
        {
          $set: {
            driverId: driverObjectId,
            status: "active",
          },
        },
      ),
    ]);

    /* ------------------------------------------------------------------ */
    /* 5. FORMAT BOOKINGS FOR FRONTEND                                      */
    /* ------------------------------------------------------------------ */
    const formattedBookings = bookings.map(formatPoolingBooking);

    /* ------------------------------------------------------------------ */
    /* 6. EMIT SUCCESS BACK TO DRIVER                                       */
    /* ------------------------------------------------------------------ */
    socket.emit("poolingTripStarted", {
      tripId: poolingTrip._id,
      stops: poolingTrip.stops,
      currentStopIndex: 0,
      bookings: formattedBookings, // ← full objects
      totalDistance,
      totalDuration,
    });

    await Promise.all(
      formattedBookings.map((booking) =>
        sendNotifToClient(
          booking.client.id,
          `Driver accepted your pooling booking and ${stops.length} other booking${stops.length !== 1 ? "s" : ""}.`,
          "Your driver has started the trip and is on the way!",
          {
            type: "pooling_trip_accepted",
          },
        ),
      ),
    );
  });
};

export const addToPoolingTrip = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("addToPoolingTrip", async (payload: AddToPoolingPayload) => {
    const { driverId, bookingId, driverCoords, maxRequests } = payload;

    /* ------------------------------------------------------------------ */
    /* 1. VALIDATE PAYLOAD                                                  */
    /* ------------------------------------------------------------------ */
    if (!driverId || !bookingId || !driverCoords?.lat || !driverCoords?.lng) {
      socket.emit("poolingError", { message: "Missing required fields" });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 2. FETCH ACTIVE TRIP + NEW BOOKING IN PARALLEL                      */
    /* ------------------------------------------------------------------ */
    const driverObjectId = new mongoose.Types.ObjectId(driverId);
    const bookingObjectId = new mongoose.Types.ObjectId(bookingId);

    const [activeTrip, newBooking] = await Promise.all([
      PoolingTripModel.findOne({
        driverId: driverObjectId,
        status: "active",
      }).lean(),
      BookingModel.findOne({
        _id: bookingObjectId,
        status: "pending",
        driverId: null,
      })
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

    /* ------------------------------------------------------------------ */
    /* 3. VALIDATE TRIP EXISTS                                              */
    /* ------------------------------------------------------------------ */
    if (!activeTrip) {
      socket.emit("poolingError", { message: "No active pooling trip found" });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 4. VALIDATE BOOKING IS STILL AVAILABLE                              */
    /* ------------------------------------------------------------------ */
    if (!newBooking) {
      socket.emit("poolingError", {
        message: "Booking is no longer available",
        bookingId,
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 5. CHECK CAPACITY                                                    */
    /* ------------------------------------------------------------------ */
    if (activeTrip.bookingIds.length >= maxRequests) {
      socket.emit("poolingError", {
        message: `Trip is already at maximum capacity of ${maxRequests} bookings`,
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 6. GUARD AGAINST DUPLICATE                                           */
    /* ------------------------------------------------------------------ */
    const alreadyInTrip = activeTrip.bookingIds.some(
      (id) => id.toString() === bookingId,
    );

    if (alreadyInTrip) {
      socket.emit("poolingError", {
        message: "This booking is already in your trip",
        bookingId,
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 7. SPLIT STOPS INTO COMPLETED + REMAINING                           */
    /* ------------------------------------------------------------------ */
    const remainingStops: PoolingStop[] = activeTrip.stops
      .filter((s) => !s.completed)
      .map((s) => ({
        ...s,
        bookingId: s.bookingId.toString(),
        completedAt: s.completedAt ?? null,
        coords: {
          lat: Number(s.coords.lat),
          lng: Number(s.coords.lng),
        },
      }));

    const completedStops = activeTrip.stops
      .filter((s) => s.completed)
      .map((s) => ({
        ...s,
        bookingId: s.bookingId.toString(),
        completedAt: s.completedAt ?? null,
        coords: {
          lat: Number(s.coords.lat),
          lng: Number(s.coords.lng),
        },
      }));

    /* ------------------------------------------------------------------ */
    /* 8. BUILD NEW STOP LABELS                                             */
    /* ------------------------------------------------------------------ */
    const newBookingIndex = activeTrip.bookingIds.length + 1;

    const newPickup: Pick<PoolingStop, "bookingId" | "label" | "coords"> = {
      bookingId,
      label: `P${newBookingIndex}`,
      coords: {
        lat: newBooking.pickUp.coords.lat,
        lng: newBooking.pickUp.coords.lng,
      },
    };

    const newDropoff: Pick<PoolingStop, "bookingId" | "label" | "coords"> = {
      bookingId,
      label: `D${newBookingIndex}`,
      coords: {
        lat: newBooking.dropOff.coords.lat,
        lng: newBooking.dropOff.coords.lng,
      },
    };

    /* ------------------------------------------------------------------ */
    /* 9. RUN MAPBOX OPTIMIZED TRIPS FOR UPDATED ROUTE                     */
    /* ------------------------------------------------------------------ */
    let updatedRemainingStops: OptimizedStop[];
    let newTotalDistance: number;
    let newTotalDuration: number;

    try {
      const optimized = await mapboxOptimizedMidTrip(
        driverCoords,
        remainingStops,
        newPickup,
        newDropoff,
      );
      updatedRemainingStops = optimized.stops;
      newTotalDistance = optimized.totalDistanceKm;
      newTotalDuration = optimized.totalDurationMinutes;
    } catch (err) {
      console.error(
        "Mapbox optimization failed, rejecting addToPoolingTrip:",
        err,
      );
      socket.emit("poolingError", {
        message: "Failed to optimize route. Please try again.",
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 10. MERGE COMPLETED + UPDATED REMAINING                             */
    /* ------------------------------------------------------------------ */
    const completedCount = completedStops.length;

    const reorderedRemaining = updatedRemainingStops.map((stop, index) => ({
      ...stop,
      order: completedCount + index,
    }));

    const finalStops = [...completedStops, ...reorderedRemaining].map((s) => ({
      ...s,
      bookingId: new mongoose.Types.ObjectId(s.bookingId),
    }));

    /* 11. UPDATE TRIP */
    const [updatedTrip] = await Promise.all([
      PoolingTripModel.findByIdAndUpdate(
        activeTrip._id,
        {
          $set: {
            stops: finalStops,
            totalDistance: newTotalDistance,
            totalDuration: newTotalDuration,
          },
          $push: { bookingIds: bookingObjectId },
        },
        { new: true },
      ).lean(),
      BookingModel.findByIdAndUpdate(bookingObjectId, {
        $set: { driverId: driverObjectId, status: "active" },
      }),
    ]);

    /* ------------------------------------------------------------------ */
    /* 12. FORMAT NEW BOOKING + EMIT                                        */
    /* ------------------------------------------------------------------ */
    if (!updatedTrip) {
      socket.emit("poolingError", {
        message: "Failed to update trip. Please try again.",
      });
      return;
    }

    const formattedNewBooking = formatPoolingBooking(newBooking);

    const addedDistanceKm = newTotalDistance - activeTrip.totalDistance;
    const addedDurationMinutes = newTotalDuration - activeTrip.totalDuration;

    socket.emit("poolingTripUpdated", {
      tripId: updatedTrip._id.toString(),
      stops: updatedTrip.stops.map((s) => ({
        ...s,
        bookingId: s.bookingId.toString(),
      })),
      currentStopIndex: activeTrip.currentStopIndex,
      addedDistanceKm: Math.round(addedDistanceKm * 10) / 10,
      addedDurationMinutes: Math.round(addedDurationMinutes),
      newBookingId: bookingId,
      newBooking: formattedNewBooking,
    });

    await sendNotifToClient(
      formattedNewBooking.client.id,
      `Driver accepted your pooling booking.`,
      "Please wait for the driver to arrive at your pickup location.",
      { type: "pooling_trip_accepted" },
    );
  });
};

export const poolingTripCompleted = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("poolingTripCompleted", async (payload: PoolingTripCompletedPayload) => {
    const { tripId, driverId } = payload;

    /* ------------------------------------------------------------------ */
    /* 1. VALIDATE PAYLOAD                                                  */
    /* ------------------------------------------------------------------ */
    if (!tripId || !driverId) {
      socket.emit("poolingError", { message: "Missing required fields" });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 2. FETCH TRIP AND VALIDATE OWNERSHIP                                 */
    /* ------------------------------------------------------------------ */
    const trip = await PoolingTripModel.findOne({
      _id: new mongoose.Types.ObjectId(tripId),
      driverId: new mongoose.Types.ObjectId(driverId),
      status: "active",
    }).lean();

    if (!trip) {
      socket.emit("poolingError", {
        message: "Active pooling trip not found",
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 3. VERIFY ALL STOPS ARE COMPLETED                                    */
    /* Safety guard — all stops must be done before trip can complete      */
    /* ------------------------------------------------------------------ */
    const hasIncompleteStops = trip.stops.some((s) => !s.completed);

    if (hasIncompleteStops) {
      socket.emit("poolingError", {
        message: "Not all stops have been completed",
      });
      return;
    }

    const completedAt = new Date();

    /* ------------------------------------------------------------------ */
    /* 4. COMPLETE TRIP + ALL BOOKINGS IN PARALLEL                         */
    /* ------------------------------------------------------------------ */
    await Promise.all([
      // Mark pooling trip as completed
      PoolingTripModel.findByIdAndUpdate(tripId, {
        status: "completed",
        completedAt,
      }),

      // Mark all bookings as completed
      // Note: individual bookings may already be "completed" from
      // the uploadReceipt endpoint — updateMany is idempotent here
      BookingModel.updateMany(
        {
          _id: { $in: trip.bookingIds },
          driverId: new mongoose.Types.ObjectId(driverId),
        },
        {
          status: "completed",
          completedAt,
        },
      ),
    ]);

    /* ------------------------------------------------------------------ */
    /* 5. EMIT CONFIRMATION BACK TO DRIVER                                  */
    /* ------------------------------------------------------------------ */
    socket.emit("poolingTripCompletedConfirmed", {
      tripId,
      completedAt,
      totalBookings: trip.bookingIds.length,
    });
  });
};

export const updatePoolingLocation = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);

  on("updatePoolingLocation", async (data: UpdatePoolingLocationPayload) => {
    const { lat, lng, poolingConfig } = data;
    const driverId = socket.data.userId;

    /* 1. FETCH ACTIVE TRIP */
    const activeTrip = await PoolingTripModel.findOne({
      driverId: new mongoose.Types.ObjectId(driverId),
      status: "active",
    }).lean();

    if (!activeTrip) return;

    /* 2. CAPACITY CHECK */
    if (activeTrip.bookingIds.length >= poolingConfig.maxRequests) return;

    /* 3. GET REMAINING STOPS */
    const remainingStops = activeTrip.stops
      .filter((s) => !s.completed)
      .sort((a, b) => a.order - b.order);

    if (remainingStops.length === 0) return;

    /* 4. CALCULATE REMAINING DISTANCE */
    const ROAD_FACTOR = 1.35;

    const allPoints = [
      { lat, lng },
      ...remainingStops.map((s) => ({ lat: s.coords.lat, lng: s.coords.lng })),
    ];

    let remainingDistanceKm = 0;
    for (let i = 0; i < allPoints.length - 1; i++) {
      remainingDistanceKm += calculateDistance(allPoints[i], allPoints[i + 1]);
    }
    remainingDistanceKm *= ROAD_FACTOR;

    /* 5. DYNAMIC PICKUP RADIUS */
    const pickupRadiusKm =
      poolingConfig.basePickupRadiusKm +
      remainingDistanceKm * poolingConfig.pickupRadiusGrowthPercent;

    /* 6. FETCH PENDING POOLING BOOKINGS — same vehicle type only, no city filter */
    const pendingBookings = await BookingModel.find({
      status: "pending",
      "bookingType.type": "pooling",
      "selectedVehicle.vehicleTypeId": socket.data.vehicle,
      "selectedVehicle.variantId": socket.data.vehicleVariant,
      _id: { $nin: activeTrip.bookingIds },
      driverId: null,
    }).lean();

    if (pendingBookings.length === 0) return;

    /* 7. FORMAT REMAINING STOPS */
    const formattedRemaining: PoolingStop[] = remainingStops.map((s) => ({
      bookingId: s.bookingId.toString(),
      type: s.type,
      label: s.label,
      coords: s.coords,
      order: s.order,
      completed: s.completed,
      completedAt: s.completedAt ?? null,
    }));

    /* 8. CHECK CONDITIONS PER BOOKING */
    for (const booking of pendingBookings) {
      // Condition 1 — pickup within dynamic radius
      const distanceToPickupKm = calculateDistance(
        { lat, lng },
        { lat: booking.pickUp.coords.lat, lng: booking.pickUp.coords.lng },
      );

      if (distanceToPickupKm > pickupRadiusKm) continue;

      // Condition 2 — cheapest insertion detour check
      const newPickup = {
        bookingId: booking._id.toString(),
        label: `P${activeTrip.bookingIds.length + 1}`,
        coords: {
          lat: booking.pickUp.coords.lat,
          lng: booking.pickUp.coords.lng,
        },
      };

      const newDropoff = {
        bookingId: booking._id.toString(),
        label: `D${activeTrip.bookingIds.length + 1}`,
        coords: {
          lat: booking.dropOff.coords.lat,
          lng: booking.dropOff.coords.lng,
        },
      };
      const { addedDistanceKm, addedDurationMinutes } =
        cheapestInsertionMidTrip(
          formattedRemaining,
          { lat, lng },
          newPickup,
          newDropoff,
        );

      // Condition 2 — detour percent vs remaining distance
      if (
        activeTrip.totalDistance > 0 &&
        addedDistanceKm / activeTrip.totalDistance >
          poolingConfig.maxDetourPercent
      ) {
        console.log("detour too high");
        continue;
      }

      // Condition 3 — total distance ceiling
      if (
        activeTrip.totalDistance + addedDistanceKm >
        poolingConfig.maxTotalDistanceKm
      ) {
        console.log("total distance too high");
        continue;
      }

      // Condition 4 — total duration ceiling
      if (
        activeTrip.totalDuration + addedDurationMinutes >
        poolingConfig.maxTotalTimeMinutes
      ) {
        console.log("total duration too high");
        continue;
      }

      // All conditions passed — emit to driver
      socket.emit("incomingPoolingRequest", {
        bookingId: booking._id.toString(),
        addedDistanceKm: Math.round(addedDistanceKm * 10) / 10,
        addedDurationMinutes: Math.round(addedDurationMinutes),
        pickupCoords: booking.pickUp.coords,
        dropoffCoords: booking.dropOff.coords,
        pickupAddress: booking.pickUp.address,
        dropoffAddress: booking.dropOff.address,
      });
    }
  });
};
