import BookingModel, { IBooking } from "../../models/Booking";

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
