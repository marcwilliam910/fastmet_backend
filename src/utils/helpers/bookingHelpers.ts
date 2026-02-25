import mongoose from "mongoose";
import BookingModel, { IBooking } from "../../models/Booking";
import { calculateDistance } from "./distanceCalculator";
import { getLateBoundary } from "./date";
import { CustomSocket } from "../../sockets/socket";

export const BUFFER_MINUTES = 15;
export const MIN_GAP_MINUTES = 20;

type FeasibilityResult = { ok: true } | { ok: false; reason: string };

export interface BookingTimeSlot {
  startTime: Date | string;
  durationMinutes: number;
}

export type ScheduleConflictResult = "none" | "overlap" | "gap_too_small";

export const checkScheduleConflict = (
  slotA: BookingTimeSlot,
  slotB: BookingTimeSlot,
): ScheduleConflictResult => {
  const aStart = new Date(slotA.startTime);
  const bStart = new Date(slotB.startTime);

  if (isNaN(aStart.getTime()) || isNaN(bStart.getTime())) {
    throw new Error("Invalid startTime provided to checkScheduleConflict");
  }

  const aEnd = new Date(
    aStart.getTime() + (slotA.durationMinutes + BUFFER_MINUTES) * 60 * 1000,
  );

  const bEnd = new Date(
    bStart.getTime() + (slotB.durationMinutes + BUFFER_MINUTES) * 60 * 1000,
  );

  const aStartMs = aStart.getTime();
  const aEndMs = aEnd.getTime();
  const bStartMs = bStart.getTime();
  const bEndMs = bEnd.getTime();

  // 1️⃣ Hard overlap check (true time intersection)
  const overlaps = aStartMs < bEndMs && aEndMs > bStartMs;
  if (overlaps) {
    console.log("Overlaps: ", overlaps);
    return "overlap";
  }

  // 2️⃣ Gap check (absolute time, no calendar dependency)
  let gapMinutes = 0;

  if (aEndMs <= bStartMs) {
    gapMinutes = (bStartMs - aEndMs) / 60000;
  } else if (bEndMs <= aStartMs) {
    gapMinutes = (aStartMs - bEndMs) / 60000;
  }

  if (gapMinutes > 0 && gapMinutes < MIN_GAP_MINUTES) {
    console.log("Gap too small: ", gapMinutes);
    return "gap_too_small";
  }

  return "none";
};

export const canAcceptScheduledBooking = async (
  bookingId: string,
  existingBookings: IBooking[],
): Promise<FeasibilityResult> => {
  const booking = await BookingModel.findById(bookingId);
  if (!booking) {
    return { ok: false, reason: "Booking not found." };
  }

  const newSlot: BookingTimeSlot = {
    startTime: booking.bookingType.value,
    durationMinutes: booking.routeData.duration,
  };

  for (const existing of existingBookings) {
    const existingSlot: BookingTimeSlot = {
      startTime: existing.bookingType.value,
      durationMinutes: existing.routeData.duration,
    };

    const conflict = checkScheduleConflict(newSlot, existingSlot);

    if (conflict === "overlap") {
      return {
        ok: false,
        reason: "This booking overlaps with another scheduled trip.",
      };
    }
    if (conflict === "gap_too_small") {
      return {
        ok: false,
        reason:
          "Not enough time between this booking and another scheduled trip.",
      };
    }
  }

  return { ok: true };
};

export const canAcceptAsapBooking = async (
  bookingId: string,
  scheduledBookings: IBooking[],
): Promise<FeasibilityResult> => {
  const booking = await BookingModel.findById(bookingId);
  if (!booking) {
    return { ok: false, reason: "Booking not found." };
  }

  if (booking.status !== "searching" && booking.status !== "pending") {
    return {
      ok: false,
      reason: "This booking is no longer available",
    };
  }

  const newSlot: BookingTimeSlot = {
    startTime: new Date(),
    durationMinutes: booking.routeData.duration,
  };

  for (const scheduled of scheduledBookings) {
    if (!scheduled.bookingType?.value) continue;

    const scheduledSlot: BookingTimeSlot = {
      startTime: scheduled.bookingType.value,
      durationMinutes: scheduled.routeData.duration,
    };

    const conflict = checkScheduleConflict(newSlot, scheduledSlot);

    if (conflict === "overlap") {
      return {
        ok: false,
        reason:
          "Cannot offer service for this ASAP booking because it conflicts with a scheduled booking.",
      };
    }
    if (conflict === "gap_too_small") {
      return {
        ok: false,
        reason:
          "Not enough time between this ASAP booking and a scheduled trip.",
      };
    }
  }

  return { ok: true };
};

export const refreshDriverBookings = async (
  socket: CustomSocket,
  location: { lat: number; lng: number },
) => {
  const {
    vehicleType,
    userId: driverId,
    serviceAreas,
    vehicle,
    vehicleVariant,
  } = socket.data;

  // Defensive: If for some reason required fields aren't set
  if (
    !vehicleType ||
    !driverId ||
    !serviceAreas ||
    !vehicle ||
    !vehicleVariant
  ) {
    console.log("Invalid driver session");
    socket.emit("error", { message: "Invalid driver session" });
    return;
  }
  // Fetching driver's service areas, vehicle, and vehicleVariant

  const driverServiceAreas = serviceAreas || [];

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
  const [asapBookings, scheduledBookings, poolingBookings] = await Promise.all([
    BookingModel.find({
      status: "searching",
      "bookingType.type": "asap",
      "selectedVehicle.vehicleTypeId": vehicle,
      "selectedVehicle.variantId": vehicleVariant,
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
      "selectedVehicle.vehicleTypeId": vehicle,
      "selectedVehicle.variantId": vehicleVariant,
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
    BookingModel.find({
      status: "pending",
      "bookingType.type": "pooling",
      "selectedVehicle.vehicleTypeId": vehicle,
      "selectedVehicle.variantId": vehicleVariant,
      ...cityFilter,
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
  const eligibleScheduledBookings = scheduledBookings.filter((booking: any) => {
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
  });

  console.log(
    `✅ ${nearbyAsapBookings.length} ASAP bookings within radius, ` +
      `${eligibleScheduledBookings.length} scheduled bookings in service areas`,
  );

  // Combine and format
  const allEligibleBookings = [
    ...nearbyAsapBookings,
    ...eligibleScheduledBookings,
    ...poolingBookings,
  ];

  const currentBookingRooms = new Set(
    [...socket.rooms].filter((r) => r.startsWith("BOOKING_")),
  );

  const newBookingRooms = new Set(
    allEligibleBookings.map((booking: any) => `BOOKING_${booking._id}`),
  );

  // Leave rooms that are no longer eligible
  for (const room of currentBookingRooms) {
    if (!newBookingRooms.has(room)) {
      socket.leave(room);
      console.log(`🚪 Driver ${socket.data.userId} left stale room ${room}`);
    }
  }

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
      `(${nearbyAsapBookings.length} ASAP + ${eligibleScheduledBookings.length} scheduled) + (${poolingBookings.length} pooling)`,
  );

  socket.emit("pendingBookingsUpdated", {
    bookings: formattedBookings,
  });
};
