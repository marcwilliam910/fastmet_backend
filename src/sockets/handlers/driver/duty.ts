import { withErrorHandling } from "../../../utils/socketWrapper";
import { CustomSocket } from "../../socket";
import BookingModel from "../../../models/Booking";
import { calculateDistance } from "../../../utils/helpers/distanceCalculator";
import { SOCKET_ROOMS } from "../../../utils/constants";
import mongoose from "mongoose";
import { sendNotifToClient } from "../../../utils/pushNotifications";
import DriverModel from "../../../models/Driver";
import { getLateBoundary } from "../../../utils/helpers/date";
import { checkScheduleConflict } from "../../../utils/helpers/bookingFeasibility";

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

        // Join required socket rooms
        socket.join(SOCKET_ROOMS.ON_DUTY);
        socket.join(SOCKET_ROOMS.AVAILABLE);

        // Join vehicle-specific room
        const vehicleRoom = `VEHICLE_${vehicleType.toUpperCase()}`;
        socket.join(vehicleRoom);

        // Store driver's session data
        socket.data.location = location;
        socket.data.vehicleType = vehicleType;

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
    // Driver must be on duty to update location
    if (!socket.rooms.has(SOCKET_ROOMS.ON_DUTY)) {
      socket.emit("error", { message: "Driver must be on duty" });
      return;
    }

    socket.data.location = location;
    const vehicleType = socket.data.vehicleType;
    const driverId = socket.data.userId;

    // Defensive: If for some reason required fields aren't set
    if (!vehicleType || !driverId) {
      console.log("Invalid driver session");
      socket.emit("error", { message: "Invalid driver session" });
      return;
    }
    // Fetching driver's service areas, vehicle, and vehicleVariant
    const driver = await DriverModel.findById(driverId)
      .select("serviceAreas vehicle vehicleVariant")
      .lean();
    if (!driver) {
      socket.emit("error", { message: "Driver not found" });
      return;
    }
    const driverServiceAreas = driver.serviceAreas || [];

    // Driver must have a vehicle assigned
    if (!driver.vehicle) {
      socket.emit("error", { message: "Driver has no vehicle assigned" });
      return;
    }

    // Build the city filter based on driver's service areas
    let cityFilter;

    if (driverServiceAreas.includes("Metro Manila")) {
      // Driver serves all cities - match ANY booking
      cityFilter = {}; // No filter needed
    } else {
      // Driver only serves specific cities - match ONLY those cities (not "Metro Manila" unknown)
      cityFilter = { "pickUp.city": { $in: driverServiceAreas } };
    }

    // Fetch ASAP and scheduled bookings in parallel
    const [asapBookings, scheduledBookings] = await Promise.all([
      BookingModel.find({
        status: "searching",
        "bookingType.type": "asap",
        "selectedVehicle.vehicleTypeId": driver.vehicle,
        "selectedVehicle.variantId": driver.vehicleVariant || null,
      })
        .sort({ createdAt: -1 })
        .populate({
          path: "customerId",
          select: "fullName profilePictureUrl phoneNumber",
        })
        .populate({
          path: "selectedVehicle.vehicleTypeId",
          select: "name freeServices",
        })
        .lean(),
      BookingModel.find({
        status: "pending",
        "bookingType.type": "schedule",
        "selectedVehicle.vehicleTypeId": driver.vehicle,
        "selectedVehicle.variantId": driver.vehicleVariant || null,
        requestedDrivers: { $nin: [new mongoose.Types.ObjectId(driverId)] },
        "bookingType.value": { $gte: getLateBoundary() },
        ...cityFilter, // 🆕 Apply city filter here
      })
        .sort({ "bookingType.value": 1 })
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

    const driverOfferedBookings = await BookingModel.find({
      requestedDrivers: { $in: [new mongoose.Types.ObjectId(driverId)] },
      status: "pending",
      "bookingType.type": "schedule",
      driverId: null,
    }).lean();

    console.log(
      `🔍 Found ${asapBookings.length} ASAP bookings, ${scheduledBookings.length} scheduled bookings`,
    );

    // Filter ASAP bookings by proximity
    const nearbyAsapBookings = asapBookings.filter((booking: any) => {
      const distance = calculateDistance(
        { lat: booking.pickUp.coords.lat, lng: booking.pickUp.coords.lng },
        { lat: location.lat, lng: location.lng },
      );
      return distance <= (booking.currentRadiusKm || 5);
    });

    // Around line where you filter scheduled bookings
    const eligibleScheduledBookings = scheduledBookings.filter(
      (booking: any) => {
        // Check schedule conflicts
        for (const offeredBooking of driverOfferedBookings) {
          const conflict = checkScheduleConflict(
            {
              startTime: booking.bookingType.value,
              durationMinutes: booking.routeData.duration,
            },
            {
              startTime: offeredBooking.bookingType.value,
              durationMinutes: offeredBooking.routeData.duration,
            },
          );
          if (conflict !== "none") return false;
        }

        return true;
      },
    );

    console.log(
      `✅ ${nearbyAsapBookings.length} ASAP bookings within radius, ` +
        `${eligibleScheduledBookings.length} scheduled bookings in service areas`,
    );

    // Combine and format
    const allEligibleBookings = [
      ...nearbyAsapBookings,
      ...eligibleScheduledBookings,
    ];

    const formattedBookings = allEligibleBookings.map((booking: any) => {
      const temporaryRoom = `BOOKING_${booking._id}`;
      socket.join(temporaryRoom);

      const { customerId, selectedVehicle, ...rest } = booking;
      const distance = calculateDistance(
        { lat: booking.pickUp.coords.lat, lng: booking.pickUp.coords.lng },
        { lat: location.lat, lng: location.lng },
      );
      return {
        ...rest,
        distanceFromPickup: distance,
        client: {
          id: customerId?._id,
          name: customerId?.fullName,
          profilePictureUrl: customerId?.profilePictureUrl,
          phoneNumber: customerId?.phoneNumber,
        },
        selectedVehicle: {
          freeServices: selectedVehicle?.vehicleTypeId?.freeServices || [],
        },
      };
    });

    console.log(
      `📦 Driver ${socket.data.userId} sees ${formattedBookings.length} total bookings ` +
        `(${nearbyAsapBookings.length} ASAP + ${eligibleScheduledBookings.length} scheduled)`,
    );

    socket.emit("pendingBookingsUpdated", {
      bookings: formattedBookings,
    });
  });
};

export const setDriverAvailable = (socket: CustomSocket) => {
  const on = withErrorHandling(socket);

  on(
    "setAvailability",
    async (data: { bookingId: string; clientId: string }) => {
      socket.join(SOCKET_ROOMS.AVAILABLE);
      console.log(`✅ Driver ${socket.data.userId} joined AVAILABLE room`);

      // bookingId and clientId must be present, just for defensive clarity
      if (!data.bookingId || !data.clientId) {
        socket.emit("error", { message: "Missing bookingId or clientId" });
        return;
      }

      // Complete booking in DB
      const updatedBooking = await BookingModel.findOneAndUpdate(
        { _id: data.bookingId },
        {
          status: "completed",
          completedAt: new Date(),
        },
        { new: true },
      );

      if (!updatedBooking) {
        socket.emit("error", { message: "Booking not found or not updated" });
        return;
      }

      // Send push notification to client
      await sendNotifToClient(
        data.clientId,
        "📦 Delivery Completed!",
        "Your package has been delivered successfully. Tap to view proof of delivery.",
        {
          type: "booking_completed",
        },
      );

      const location = socket.data.location;
      const vehicleType = socket.data.vehicleType;
      const driverId = socket.data.userId;

      if (!location || !vehicleType || !driverId) {
        socket.emit("error", {
          message: "Driver not ready for availability update",
        });
        return;
      }

      // Get driver's service areas, vehicle, and vehicleVariant
      const driver = await DriverModel.findById(driverId)
        .select("serviceAreas vehicle vehicleVariant")
        .lean();

      if (!driver) {
        socket.emit("error", { message: "Driver not found" });
        return;
      }
      const driverServiceAreas = driver.serviceAreas || [];

      // Driver must have a vehicle assigned
      if (!driver.vehicle) {
        socket.emit("error", { message: "Driver has no vehicle assigned" });
        return;
      }

      // Build the city filter based on driver's service areas
      let cityFilter;

      if (driverServiceAreas.includes("Metro Manila")) {
        // Driver serves all cities - match ANY booking
        cityFilter = {}; // No filter needed
      } else {
        // Driver only serves specific cities - match ONLY those cities (not "Metro Manila" unknown)
        cityFilter = { "pickUp.city": { $in: driverServiceAreas } };
      }

      // Fetch eligible bookings in parallel
      const [asapBookings, scheduledBookings] = await Promise.all([
        BookingModel.find({
          status: "searching",
          "bookingType.type": "asap",
          "selectedVehicle.vehicleTypeId": driver.vehicle,
          "selectedVehicle.variantId": driver.vehicleVariant || null,
        })
          .sort({ createdAt: -1 })
          .populate({
            path: "customerId",
            select: "fullName profilePictureUrl phoneNumber",
          })
          .populate({
            path: "selectedVehicle.vehicleTypeId",
            select: "name freeServices",
          })
          .lean(),
        BookingModel.find({
          status: "pending",
          "bookingType.type": "schedule",
          "selectedVehicle.vehicleTypeId": driver.vehicle,
          "selectedVehicle.variantId": driver.vehicleVariant || null,
          requestedDrivers: { $nin: [new mongoose.Types.ObjectId(driverId)] },
          "bookingType.value": { $gte: getLateBoundary() },
          ...cityFilter, // 🆕 Apply city filter here
        })
          .sort({ "bookingType.value": 1 })
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

      const driverOfferedBookings = await BookingModel.find({
        requestedDrivers: { $in: [new mongoose.Types.ObjectId(driverId)] },
        status: "pending",
        "bookingType.type": "schedule",
        driverId: null,
      }).lean();

      // Filter (same logic as before)
      const nearbyAsapBookings = asapBookings.filter((booking: any) => {
        const distance = calculateDistance(
          { lat: booking.pickUp.coords.lat, lng: booking.pickUp.coords.lng },
          { lat: location.lat, lng: location.lng },
        );
        return distance <= (booking.currentRadiusKm || 5);
      });

      // Around line where you filter scheduled bookings
      const eligibleScheduledBookings = scheduledBookings.filter(
        (booking: any) => {
          // Check schedule conflicts
          for (const offeredBooking of driverOfferedBookings) {
            const conflict = checkScheduleConflict(
              {
                startTime: booking.bookingType.value,
                durationMinutes: booking.routeData.duration,
              },
              {
                startTime: offeredBooking.bookingType.value,
                durationMinutes: offeredBooking.routeData.duration,
              },
            );
            if (conflict !== "none") return false;
          }

          return true;
        },
      );

      const allEligibleBookings = [
        ...nearbyAsapBookings,
        ...eligibleScheduledBookings,
      ];

      const formattedBookings = allEligibleBookings.map((booking: any) => {
        const { customerId, selectedVehicle, ...rest } = booking;
        const distance = calculateDistance(
          { lat: booking.pickUp.coords.lat, lng: booking.pickUp.coords.lng },
          { lat: location.lat, lng: location.lng },
        );
        return {
          ...rest,
          distanceFromPickup: distance,
          client: {
            id: customerId?._id,
            name: customerId?.fullName,
            profilePictureUrl: customerId?.profilePictureUrl,
            phoneNumber: customerId?.phoneNumber,
          },
          selectedVehicle: {
            freeServices: selectedVehicle?.vehicleTypeId?.freeServices || [],
          },
        };
      });

      console.log(
        `📦 Found ${formattedBookings.length} bookings for driver ${socket.data.userId} ` +
          `(${nearbyAsapBookings.length} ASAP + ${eligibleScheduledBookings.length} scheduled)`,
      );

      socket.emit("pendingBookingsUpdated", {
        bookings: formattedBookings,
      });
    },
  );
};
