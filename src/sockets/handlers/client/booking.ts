import { Server } from "socket.io";
import BookingModel from "../../../models/Booking";
import { withErrorHandling } from "../../../utils/socketWrapper";
import { CustomSocket } from "../../socket";
import { calculateDistance } from "../../../utils/helpers/distanceCalculator";
import { SOCKET_ROOMS } from "../../../utils/constants";
import UserModel from "../../../models/User";
import { RequestBooking, Service } from "../../../types/booking";
import mongoose from "mongoose";
import NotificationModel from "../../../models/Notification";
import { sendNotifToDriver } from "../../../utils/pushNotifications";
import DriverModel from "../../../models/Driver";
import { extractCityFromCoords } from "../../../utils/helpers/locationHelpers";
import { VehicleType } from "../../../models/Vehicle";
import { isValidDate } from "../../../utils/helpers/date";
import {
  bookingExpiryQueue,
  // scheduledReminderQueue,
} from "../../../queues";
import {
  removeDriverCheckInJobs,
  scheduleDriverCheckInJobs,
} from "../../../workers/scheduledBookingCheckDriverWorker";
import {
  removeClientCheckInJobs,
  scheduleClientCheckInJobs,
} from "../../../workers/scheduledBookingCheckClientWorker";
import { getCityFromPlaceId } from "../../../utils/helpers/getCity";

export const requestAsapBooking = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("request_asap_booking", async (data: RequestBooking) => {
    console.log("📨 Booking request received:", data);

    // Early validation
    if (!data.selectedVehicle?.key || !data.selectedVehicle?.searchConfig) {
      socket.emit("bookingRequestFailed", {
        message: "Invalid vehicle type or missing search configuration",
      });
      return;
    }

    if (!data.customerId || !data.pickUp || !data.dropOff) {
      socket.emit("bookingRequestFailed", {
        message: "Missing required booking fields",
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* 1. Create booking (searching immediately)                           */
    /* ------------------------------------------------------------------ */
    const searchConfig = data.selectedVehicle.searchConfig;

    const { initialRadiusKm, incrementKm, maxRadiusKm, intervalMs } =
      searchConfig;

    const booking = await BookingModel.create({
      ...data,
      selectedVehicle: {
        vehicleTypeId: new mongoose.Types.ObjectId(
          String(data.selectedVehicle._id),
        ),
        variantId: data.selectedVehicle.variant
          ? new mongoose.Types.ObjectId(
              String(data.selectedVehicle.variant._id),
            )
          : null,
      },
      status: "searching",
      searchStep: 1,
      currentRadiusKm: initialRadiusKm,
    });

    const vehicleType = data.selectedVehicle.variant
      ? `${data.selectedVehicle.key}_${data.selectedVehicle.variant.maxLoadKg}`
      : data.selectedVehicle.key;
    console.log("VEHICLE TYPE: ", vehicleType);

    const client = await UserModel.findById(booking.customerId)
      .select("fullName profilePictureUrl phoneNumber email")
      .lean();

    if (!client) {
      socket.emit("bookingRequestFailed", {
        message: "Your ID does not exist on our record",
      });
      return;
    }

    socket.emit("bookingRequestSaved", {
      success: true,
      bookingId: booking._id,
      message: "Booking request saved successfully",
    });

    /* ------------------------------------------------------------------ */
    /* 2. SCHEDULE 10-MINUTE EXPIRY JOB (BullMQ)                           */
    /* ------------------------------------------------------------------ */
    const bookingIdStr = (booking._id as mongoose.Types.ObjectId).toString();
    await bookingExpiryQueue.add(
      "expire",
      { bookingId: bookingIdStr },
      {
        delay: 10 * 60 * 1000, // 10 minutes
        jobId: `expiry-${bookingIdStr}`,
      },
    );
    console.log(
      `⏱️  Scheduled 10-minute expiry job for booking ${bookingIdStr}`,
    );

    /* ------------------------------------------------------------------ */
    /* 3. Vehicle config & search logic                                    */
    /* ------------------------------------------------------------------ */
    const vehicleRoom = `VEHICLE_${vehicleType.toUpperCase()}`;
    const temporaryRoom = `BOOKING_${booking._id}`;

    const pickupCoords = {
      lat: booking.pickUp.coords.lat,
      lng: booking.pickUp.coords.lng,
    };

    /* ------------------------------------------------------------------ */
    /* 4. Recursive search step                                            */
    /* ------------------------------------------------------------------ */
    const driverList = new Set<string>();
    let searchTimeout: ReturnType<typeof setTimeout> | null = null; // ✅ track it

    const runSearchStep = async () => {
      // Populate and type-check vehicleTypeId to assure type safety for freeServices
      const freshBooking = await BookingModel.findById(booking._id)
        .populate<{
          selectedVehicle: {
            vehicleTypeId: { name: string; freeServices: Partial<Service>[] };
          };
        }>({
          path: "selectedVehicle.vehicleTypeId",
          select: "name freeServices",
        })
        .lean();

      if (!freshBooking || freshBooking.status !== "searching") {
        return;
      }

      const radiusKm = freshBooking.currentRadiusKm;

      console.log(
        `🔍 Search step ${freshBooking.searchStep} | radius ${radiusKm}km`,
      );

      socket.emit("radiusExpansion", {
        radiusKm,
        attempt: freshBooking.searchStep,
      });

      const vehicleSockets = await io.in(vehicleRoom).fetchSockets();

      const availableDriverSockets = vehicleSockets.filter(
        (s) =>
          s.rooms.has(SOCKET_ROOMS.ON_DUTY) &&
          s.rooms.has(SOCKET_ROOMS.AVAILABLE),
      );

      // Use a Map to deduplicate drivers (handles multiple sockets per driver)
      const newDriverMap = new Map<
        string,
        { socket: any; driverId: string; distanceKm: number }
      >();

      for (const driverSocket of availableDriverSockets) {
        const driverLocation = driverSocket.data.location;
        const driverId = driverSocket.data.userId as string | undefined;

        if (!driverLocation || !driverId) continue;
        // Skip if already notified in previous search steps
        if (driverList.has(driverId)) continue;
        // Skip if already processed in this search step (handles multiple sockets per driver)
        if (newDriverMap.has(driverId)) continue;

        const distance = calculateDistance(pickupCoords, {
          lat: driverLocation.lat,
          lng: driverLocation.lng,
        });

        console.log(driverSocket.id + " = " + distance);

        if (distance > radiusKm) continue;

        newDriverMap.set(driverId, {
          socket: driverSocket,
          driverId,
          distanceKm: Number(distance.toFixed(2)),
        });
      }

      const newDrivers = Array.from(newDriverMap.values());

      if (newDrivers.length > 0) {
        newDrivers.map((d) => driverList.add(d.driverId));

        newDrivers.forEach(({ socket, distanceKm }) => {
          socket.join(temporaryRoom);
          console.log("Distance: ", distanceKm);

          socket.emit("new_booking_request", {
            _id: freshBooking._id,
            bookingRef: freshBooking.bookingRef,
            client: {
              id: client._id,
              name: client.fullName,
              profilePictureUrl: client.profilePictureUrl,
              phoneNumber: client.phoneNumber,
            },
            pickUp: freshBooking.pickUp,
            dropOff: freshBooking.dropOff,
            bookingType: freshBooking.bookingType,
            routeData: freshBooking.routeData,
            selectedVehicle: {
              freeServices:
                freshBooking.selectedVehicle?.vehicleTypeId?.freeServices || [],
            },
            addedServices: freshBooking.addedServices,
            paymentMethod: freshBooking.paymentMethod,
            note: freshBooking.note,
            itemType: freshBooking.itemType,
            photos: freshBooking.photos,
            distanceFromPickup: distanceKm,
          });
        });

        console.log(
          `📤 Sent to ${newDrivers.length} drivers (radius ${radiusKm}km)`,
        );
      }

      const nextRadius = Number((radiusKm + incrementKm).toFixed(2));

      if (nextRadius > maxRadiusKm) {
        console.log(
          `🛑 Max radius reached for booking ${freshBooking.bookingRef}`,
        );
        return;
      }

      await BookingModel.findByIdAndUpdate(freshBooking._id, {
        $inc: { searchStep: 1 },
        $set: { currentRadiusKm: nextRadius },
      });

      searchTimeout = setTimeout(runSearchStep, intervalMs);
    };

    // ✅ Cancel search if client disconnects mid-search
    socket.on("disconnect", async () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
        searchTimeout = null;
      }
      driverList.clear();
    });

    /* ------------------------------------------------------------------ */
    /* 5. Start first search                                               */
    /* ------------------------------------------------------------------ */
    await runSearchStep();
  });
};

export const requestScheduleBooking = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("request_schedule_booking", async (data: RequestBooking) => {
    console.log("📨 Schedule booking request received:", data.bookingRef);

    // Early validation
    if (
      !data.customerId ||
      !data.pickUp ||
      !data.dropOff ||
      !data.selectedVehicle?.key
    ) {
      socket.emit("bookingRequestFailed", {
        message: "Missing required booking fields",
      });
      return;
    }

    if (!isValidDate(data.bookingType.value)) {
      socket.emit("bookingRequestFailed", {
        message: "Invalid booking type value",
      });
      return;
    }

    // 🆕 GET CITY FROM GOOGLE PLACES API (for scheduled bookings only)
    let pickupCity: string | null = null;

    if (data.pickUp.placeId) {
      pickupCity = await getCityFromPlaceId(data.pickUp.placeId);
    }

    // Fallback to polygon method if Google API fails or no placeId
    if (!pickupCity) {
      console.warn("⚠️ Falling back to polygon method for city detection");
      pickupCity = extractCityFromCoords(data.pickUp.coords);
    }

    if (!pickupCity) {
      console.log("❌ Could not determine city from pickup location");
      socket.emit("bookingRequestFailed", {
        message:
          "Invalid pickup location. Please ensure pickup is within Metro Manila.",
      });
      return;
    }

    console.log(`📍 Pickup city: ${pickupCity}`);

    // 1. Save booking to DB with city
    const booking = await BookingModel.create({
      ...data,
      pickUp: {
        ...data.pickUp,
        city: pickupCity, // ← Store the city here
      },
      "bookingType.value": new Date(data.bookingType.value),
      selectedVehicle: {
        vehicleTypeId: new mongoose.Types.ObjectId(
          String(data.selectedVehicle._id),
        ),
        variantId: data.selectedVehicle.variant
          ? new mongoose.Types.ObjectId(
              String(data.selectedVehicle.variant._id),
            )
          : null,
      },
      status: "pending",
    });

    const client = await UserModel.findById(booking.customerId)
      .select("fullName profilePictureUrl phoneNumber email")
      .lean();

    if (!client) {
      socket.emit("bookingRequestFailed", {
        message: "Your ID does not exist on our record",
      });
      return;
    }

    socket.emit("bookingRequestSaved", {
      success: true,
      bookingId: booking._id,
      message:
        "You will be notified when a driver offers to take your booking.",
    });

    // 2. Fetch VehicleType for name and freeServices
    const vehicleTypeDoc = await VehicleType.findById(data.selectedVehicle._id)
      .select("name freeServices")
      .lean();

    // 3. Payload
    const driverPayload = {
      client: {
        id: client._id,
        name: client.fullName,
        profilePictureUrl: client.profilePictureUrl,
        phoneNumber: client.phoneNumber,
      },
      _id: booking._id,
      pickUp: booking.pickUp,
      dropOff: booking.dropOff,
      bookingType: {
        type: booking.bookingType.type,
        value: new Date(booking.bookingType.value),
      },
      routeData: booking.routeData,
      selectedVehicle: {
        freeServices: vehicleTypeDoc?.freeServices || [],
      },
      addedServices: booking.addedServices,
      paymentMethod: booking.paymentMethod,
    };

    // 4. Determine vehicle type
    const vehicleType = data.selectedVehicle.variant
      ? `${data.selectedVehicle.key}_${data.selectedVehicle.variant.maxLoadKg}`
      : data.selectedVehicle.key;
    console.log("VEHICLE TYPE: ", vehicleType);

    if (!vehicleType) {
      socket.emit("booking_request_failed", {
        message: "Vehicle type not specified in booking",
      });
      return;
    }

    const vehicleRoom = `VEHICLE_${vehicleType.toUpperCase()}`;

    // 5. Get available & on-duty drivers with matching vehicle type
    const vehicleSockets = await io.in(vehicleRoom).fetchSockets();

    const availableDriverSockets = vehicleSockets.filter(
      (s) =>
        s.rooms.has(SOCKET_ROOMS.ON_DUTY) &&
        s.rooms.has(SOCKET_ROOMS.AVAILABLE),
    );

    console.log(
      `🔍 Found ${availableDriverSockets.length} available ${vehicleType} drivers`,
    );

    // 6. Query drivers with matching service areas
    const driverIds = availableDriverSockets.map((s) => s.data.userId);

    let serviceAreaQuery;

    if (pickupCity === "Metro Manila") {
      serviceAreaQuery = { serviceAreas: "Metro Manila" };
      console.log(
        `⚠️ Rare case: Pickup city unknown, matching only "Metro Manila" drivers`,
      );
    } else {
      serviceAreaQuery = {
        $or: [{ serviceAreas: pickupCity }, { serviceAreas: "Metro Manila" }],
      };
    }

    const drivers = await DriverModel.find({
      _id: { $in: driverIds },
      ...serviceAreaQuery,
    })
      .select("_id serviceAreas")
      .lean();

    console.log(
      `✅ Found ${drivers.length} drivers servicing ${pickupCity} from database`,
    );

    const eligibleDriverIds = new Set(
      drivers.map((driver) => driver._id.toString()),
    );

    const eligibleDrivers = availableDriverSockets.filter((driverSocket) =>
      eligibleDriverIds.has(driverSocket.data.userId),
    );

    if (eligibleDrivers.length === 0) {
      socket.emit("no_drivers_available", {
        message: `No ${vehicleType} drivers service ${pickupCity} for scheduled bookings. Try selecting a different time or location.`,
      });
      return;
    }

    console.log(
      `🚗 ${eligibleDrivers.length} ${vehicleType} drivers will receive this booking in ${pickupCity}`,
    );

    // 7. Join eligible drivers to booking room
    const temporaryRoom = `BOOKING_${booking._id}`;

    eligibleDrivers.forEach((driverSocket) => {
      driverSocket.join(temporaryRoom);
    });

    // 8. Emit booking to eligible drivers
    io.to(temporaryRoom).emit("new_booking_request", driverPayload);

    console.log(
      `📤 Scheduled booking ${booking._id} sent to ${eligibleDrivers.length} drivers in ${pickupCity}`,
    );

    // Schedule client check-in notifications
    await scheduleClientCheckInJobs(
      String(booking._id),
      booking.bookingType.value as Date,
    );
  });
};

export const requestPoolingBooking = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("request_pooling_booking", async (data: RequestBooking) => {
    console.log("📨 Schedule booking request received:", data.bookingRef);

    // Early validation
    if (
      !data.customerId ||
      !data.pickUp ||
      !data.dropOff ||
      !data.selectedVehicle?.key
    ) {
      socket.emit("bookingRequestFailed", {
        message: "Missing required booking fields",
      });
      return;
    }

    // 🆕 GET CITY FROM GOOGLE PLACES API (for scheduled bookings only)
    let pickupCity: string | null = null;

    if (data.pickUp.placeId) {
      pickupCity = await getCityFromPlaceId(data.pickUp.placeId);
    }

    // Fallback to polygon method if Google API fails or no placeId
    if (!pickupCity) {
      console.warn("⚠️ Falling back to polygon method for city detection");
      pickupCity = extractCityFromCoords(data.pickUp.coords);
    }

    if (!pickupCity) {
      console.log("❌ Could not determine city from pickup location");
      socket.emit("bookingRequestFailed", {
        message:
          "Invalid pickup location. Please ensure pickup is within Metro Manila.",
      });
      return;
    }

    console.log(`📍 Pickup city: ${pickupCity}`);

    // 1. Save booking to DB with city
    const booking = await BookingModel.create({
      ...data,
      pickUp: {
        ...data.pickUp,
        city: pickupCity, // ← Store the city here
      },
      selectedVehicle: {
        vehicleTypeId: new mongoose.Types.ObjectId(
          String(data.selectedVehicle._id),
        ),
        variantId: data.selectedVehicle.variant
          ? new mongoose.Types.ObjectId(
              String(data.selectedVehicle.variant._id),
            )
          : null,
      },
      status: "pending",
    });

    const client = await UserModel.findById(booking.customerId)
      .select("fullName profilePictureUrl phoneNumber email")
      .lean();

    if (!client) {
      socket.emit("bookingRequestFailed", {
        message: "Your ID does not exist on our record",
      });
      return;
    }

    socket.emit("bookingRequestSaved", {
      success: true,
      bookingId: booking._id,
      message: "You will be notified when a driver accepts your request.",
    });

    // 2. Fetch VehicleType for name and freeServices
    const vehicleTypeDoc = await VehicleType.findById(data.selectedVehicle._id)
      .select("name freeServices")
      .lean();

    // 3. Payload
    const driverPayload = {
      client: {
        id: client._id,
        name: client.fullName,
        profilePictureUrl: client.profilePictureUrl,
        phoneNumber: client.phoneNumber,
      },
      _id: booking._id,
      pickUp: booking.pickUp,
      dropOff: booking.dropOff,
      bookingType: {
        type: booking.bookingType.type,
        value: new Date(booking.bookingType.value),
      },
      routeData: booking.routeData,
      selectedVehicle: {
        freeServices: vehicleTypeDoc?.freeServices || [],
      },
      addedServices: booking.addedServices,
      paymentMethod: booking.paymentMethod,
    };

    // 4. Determine vehicle type
    const vehicleType = data.selectedVehicle.variant
      ? `${data.selectedVehicle.key}_${data.selectedVehicle.variant.maxLoadKg}`
      : data.selectedVehicle.key;
    console.log("VEHICLE TYPE: ", vehicleType);

    if (!vehicleType) {
      socket.emit("booking_request_failed", {
        message: "Vehicle type not specified in booking",
      });
      return;
    }

    const vehicleRoom = `VEHICLE_${vehicleType.toUpperCase()}`;

    // 5. Get available & on-duty drivers with matching vehicle type
    const vehicleSockets = await io.in(vehicleRoom).fetchSockets();

    const availableDriverSockets = vehicleSockets.filter(
      (s) =>
        s.rooms.has(SOCKET_ROOMS.ON_DUTY) &&
        s.rooms.has(SOCKET_ROOMS.AVAILABLE),
    );

    console.log(
      `🔍 Found ${availableDriverSockets.length} available ${vehicleType} drivers`,
    );

    // 6. Query drivers with matching service areas
    const driverIds = availableDriverSockets.map((s) => s.data.userId);

    let serviceAreaQuery;

    if (pickupCity === "Metro Manila") {
      serviceAreaQuery = { serviceAreas: "Metro Manila" };
      console.log(
        `⚠️ Rare case: Pickup city unknown, matching only "Metro Manila" drivers`,
      );
    } else {
      serviceAreaQuery = {
        $or: [{ serviceAreas: pickupCity }, { serviceAreas: "Metro Manila" }],
      };
    }

    const drivers = await DriverModel.find({
      _id: { $in: driverIds },
      ...serviceAreaQuery,
    })
      .select("_id serviceAreas")
      .lean();

    console.log(
      `✅ Found ${drivers.length} drivers servicing ${pickupCity} from database`,
    );

    const eligibleDriverIds = new Set(
      drivers.map((driver) => driver._id.toString()),
    );

    const eligibleDrivers = availableDriverSockets.filter((driverSocket) =>
      eligibleDriverIds.has(driverSocket.data.userId),
    );

    if (eligibleDrivers.length === 0) {
      socket.emit("no_drivers_available", {
        message: `No ${vehicleType} drivers service ${pickupCity} for scheduled bookings. Try selecting a different time or location.`,
      });
      return;
    }

    console.log(
      `🚗 ${eligibleDrivers.length} ${vehicleType} drivers will receive this booking in ${pickupCity}`,
    );

    // 7. Join eligible drivers to booking room
    const temporaryRoom = `BOOKING_${booking._id}`;

    eligibleDrivers.forEach((driverSocket) => {
      driverSocket.join(temporaryRoom);
    });

    // 8. Emit booking to eligible drivers
    io.to(temporaryRoom).emit("new_booking_request", driverPayload);

    console.log(
      `📤 Scheduled booking ${booking._id} sent to ${eligibleDrivers.length} drivers in ${pickupCity}`,
    );

    // Schedule client check-in notifications
    await scheduleClientCheckInJobs(
      String(booking._id),
      booking.bookingType.value as Date,
    );
  });
};

export const getDriverLocation = (socket: CustomSocket, io: Server) => {
  socket.on(
    "getDriverLocation",
    ({ bookingId, driverId }: { bookingId: string; driverId: string }) => {
      // Early validation
      if (!bookingId || !driverId || !socket.data.userId) {
        return;
      }

      const clientUserId = socket.data.userId;

      console.log("BOOKING ID: ", bookingId);

      console.log(`📡 Forwarding location request to driver ${driverId}`);

      // Forward request to driver
      io.to(driverId).emit("requestDriverLocation", {
        bookingId,
        clientUserId,
      });
    },
  );
};

export const pickDriver = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on(
    "acceptDriver",
    async (payload: {
      driverId: string;
      bookingId: string;
      type: "asap" | "schedule";
    }) => {
      const { driverId, bookingId } = payload;

      // Early validation
      if (!driverId || !bookingId || !payload.type) {
        socket.emit("error", {
          message: "Missing required fields",
        });
        return;
      }

      console.log(
        `🚗 Customer attempting to pick driver ${driverId} for booking ${bookingId}`,
      );

      // Check if the booking exists and is pending (using lean for read-only check)
      const existingBooking = await BookingModel.findOne({
        _id: bookingId,
        status: { $in: ["pending", "searching"] },
      }).lean();

      if (!existingBooking) {
        console.log("Booking not found or already accepted");
        socket.emit("error", {
          message: "Booking not found or already accepted",
        });
        return;
      }

      // Check if driver was actually in the requested drivers list
      const wasRequested = existingBooking.requestedDrivers.some(
        (id) => id.toString() === driverId.toString(),
      );

      if (!wasRequested) {
        console.log("Driver offer was cancelled or not requested");
        socket.emit("error", {
          message:
            "This offer is no longer available. The driver may have cancelled it.",
        });
        return;
      }

      // Update booking to active
      const booking = await BookingModel.findOneAndUpdate(
        {
          _id: bookingId,
          status: { $in: ["pending", "searching"] },
          requestedDrivers: new mongoose.Types.ObjectId(driverId),
        },
        {
          driverId,
          status: payload.type === "asap" ? "active" : "scheduled",
          acceptedAt: new Date(),
        },
        { new: true },
      );

      if (!booking) {
        console.log("Booking not found");
        socket.emit("error", {
          message: "Sorry, booking not found",
        });
        return;
      }

      /* ------------------------------------------------------------------ */
      /* REMOVE EXPIRY JOB - Driver was accepted (BullMQ)                   */
      /* ------------------------------------------------------------------ */
      try {
        const expiryJob = await bookingExpiryQueue.getJob(
          `expiry-${bookingId}`,
        );
        if (expiryJob) {
          await expiryJob.remove();
          console.log(`⏹️  Removed expiry job for booking ${bookingId}`);
        }
      } catch (err) {
        console.log(`Could not remove expiry job for ${bookingId}:`, err);
      }

      /* ------------------------------------------------------------------ */
      /* REMOVE SCHEDULED CHECK JOBS - Driver was chosen manually AND add driver check-in jobs           */
      /* ------------------------------------------------------------------ */
      if (payload.type === "schedule") {
        await removeClientCheckInJobs(bookingId);

        await scheduleDriverCheckInJobs(
          bookingId,
          booking.bookingType.value as Date,
          driverId,
        );
      }

      /* ------------------------------------------------------------------ */
      /* Notify customer and drivers                                        */
      /* ------------------------------------------------------------------ */
      const notifyCustomerSocket =
        payload.type === "asap" ? "driverAccepted" : "driverAcceptedSchedule";
      const notifyDriverAccepted =
        payload.type === "asap"
          ? "bookingConfirmed"
          : "bookingConfirmedSchedule";
      const notifyRejectedDrivers =
        payload.type === "asap" ? "bookingTaken" : "bookingTakenSchedule";

      socket.emit(notifyCustomerSocket, { bookingId });

      /* ------------------------------------------------------------------ */
      /* GET CLIENT INFO FOR NOTIFICATIONS                                   */
      /* ------------------------------------------------------------------ */
      const client = await UserModel.findById(booking.customerId)
        .select("fullName")
        .lean();

      /* ------------------------------------------------------------------ */
      /* NOTIFY DRIVERS & CREATE NOTIFICATIONS                               */
      /* ------------------------------------------------------------------ */
      for (const requestedDriverId of booking.requestedDrivers || []) {
        const requestedDriverIdStr = requestedDriverId.toString();

        let notification = null;
        let unreadNotifications = 0;
        if (requestedDriverIdStr === driverId) {
          // Create notification + push for scheduled booking only
          if (payload.type === "schedule") {
            const notifMessage = `You have been selected for a scheduled delivery from ${
              booking.pickUp?.name || "pickup"
            } to ${booking.dropOff?.name || "destination"}`;

            notification = await NotificationModel.create({
              userId: driverId,
              userType: "Driver",
              title: "Scheduled Booking Confirmed",
              message: notifMessage,
              type: "new_scheduled_ride",
              data: {
                bookingId: booking._id,
                scheduledDate: booking.bookingType.value,
                pickUp: booking.pickUp,
                dropOff: booking.dropOff,
                clientName: client?.fullName,
              },
            });

            unreadNotifications = await NotificationModel.countDocuments({
              userId: driverId,
              userType: {
                $in: ["Driver", "All"],
              },
              isRead: false,
            });

            // Send push notification
            await sendNotifToDriver(
              driverId,
              "Scheduled Booking Confirmed",
              notifMessage,
              { bookingId: booking._id, type: "new_scheduled_ride" },
            );

            console.log(`📩 Notification created for driver ${driverId}`);
          }

          // Accepted driver
          io.to(requestedDriverIdStr).emit(notifyDriverAccepted, {
            bookingId,
            notification,
            unreadNotifications,
          });
        } else {
          // Create notification + push for rejected drivers (scheduled booking only)
          if (payload.type === "schedule") {
            const rejectedMessage = `Another driver was selected for the ${
              booking.pickUp?.name || "pickup"
            } to ${booking.dropOff?.name || "destination"} booking.`;

            notification = await NotificationModel.create({
              userId: requestedDriverIdStr,
              userType: "Driver",
              title: "Booking Taken",
              message: rejectedMessage,
              type: "booking_taken",
              data: {
                bookingId: booking._id,
              },
            });

            unreadNotifications = await NotificationModel.countDocuments({
              userId: requestedDriverIdStr,
              userType: {
                $in: ["Driver", "All"],
              },
              isRead: false,
            });

            // Send push notification
            await sendNotifToDriver(
              requestedDriverIdStr,
              "Booking Taken",
              rejectedMessage,
              { bookingId: booking._id, type: "booking_taken" },
            );

            console.log(
              `📩 Notification created for rejected driver ${requestedDriverIdStr}`,
            );
          }

          // Rejected drivers
          io.to(requestedDriverIdStr).emit(notifyRejectedDrivers, {
            bookingId,
            notification,
            unreadNotifications,
          });
        }
      }

      // Notify all drivers in temporary room who haven't offered yet
      const temporaryRoom = `BOOKING_${bookingId}`;
      io.to(temporaryRoom).emit("bookingExpired", { bookingId });

      /* ------------------------------------------------------------------ */
      /* CLEANUP: Remove all sockets from temporary room                    */
      /* ------------------------------------------------------------------ */
      const socketsInRoom = await io.in(temporaryRoom).fetchSockets();
      socketsInRoom.forEach((s) => s.leave(temporaryRoom));

      console.log(
        `🧹 Cleared ${socketsInRoom.length} sockets from ${temporaryRoom}`,
      );
      console.log(`✅ Booking ${bookingId} assigned to driver ${driverId}`);
    },
  );
};

export const cancelBooking = (socket: CustomSocket, io: Server) => {
  const on = withErrorHandling(socket);

  on("cancelBookingRequest", async (payload: { bookingId: string }) => {
    const { bookingId } = payload;

    // Early validation
    if (!bookingId) {
      socket.emit("error", {
        message: "Booking ID is required",
      });
      return;
    }

    console.log(`🚗 Customer attempting to cancel booking ${bookingId}`);

    const booking = await BookingModel.findOneAndUpdate(
      { _id: bookingId, status: { $in: ["pending", "searching"] } },
      {
        status: "cancelled",
        cancelledAt: new Date(),
      },
      { new: true },
    );

    if (!booking) {
      console.log("Booking not found");
      socket.emit("error", {
        message: "Booking not found",
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* REMOVE EXPIRY JOB - Booking was cancelled (BullMQ)                 */
    /* ------------------------------------------------------------------ */
    try {
      const expiryJob = await bookingExpiryQueue.getJob(`expiry-${bookingId}`);
      if (expiryJob) {
        await expiryJob.remove();
        console.log(`⏹️  Removed expiry job for booking ${bookingId}`);
      }
    } catch (err) {
      console.log(`Could not remove expiry job for ${bookingId}:`, err);
    }

    /* ------------------------------------------------------------------ */
    /* REMOVE SCHEDULED CHECK JOBS - Booking cancelled                    */
    /* ------------------------------------------------------------------ */
    await removeClientCheckInJobs(bookingId);
    if (booking.driverId)
      await removeDriverCheckInJobs(bookingId, booking.driverId.toString());
    /* ------------------------------------------------------------------ */
    /* Notify customer and drivers                                        */
    /* ------------------------------------------------------------------ */
    socket.emit("bookingCancelled", { bookingId });

    const temporaryRoom = `BOOKING_${bookingId}`;
    io.to(temporaryRoom).emit("bookingCancelled", { bookingId });

    /* ------------------------------------------------------------------ */
    /* CLEANUP: Remove all sockets from temporary room                    */
    /* ------------------------------------------------------------------ */
    const socketsInRoom = await io.in(temporaryRoom).fetchSockets();
    socketsInRoom.forEach((s) => s.leave(temporaryRoom));

    console.log(
      `🧹 Cleared ${socketsInRoom.length} sockets from ${temporaryRoom}`,
    );
    console.log(`✅ Booking ${bookingId} cancelled`);
  });
};

export const asapTimerEnd = (socket: CustomSocket, io: Server) => {
  socket.on(
    "asapTimerEnd",
    (payload: { driverId: string; bookingId: string }) => {
      io.to(payload.driverId).emit("timerEnd", {
        bookingId: payload.bookingId,
      });
    },
  );
};
