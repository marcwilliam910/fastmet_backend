import BookingModel, { IBooking } from "../../models/Booking";

export const BUFFER_MINUTES = 15;
export const MIN_GAP_MINUTES = 20;

type FeasibilityResult = { ok: true } | { ok: false; reason: string };

export interface BookingTimeSlot {
  startTime: Date | string;
  durationMinutes: number;
}

export type ScheduleConflictResult = "none" | "overlap" | "gap_too_small";

/**
 * Checks whether two booking time slots conflict with each other.
 * Returns "overlap" if they overlap, "gap_too_small" if they are on the
 * same calendar day but the gap between them is less than MIN_GAP_MINUTES,
 * or "none" if there is no conflict.
 */
export const checkScheduleConflict = (
  slotA: BookingTimeSlot,
  slotB: BookingTimeSlot,
): ScheduleConflictResult => {
  const aStart = new Date(slotA.startTime);
  const aEnd = new Date(
    aStart.getTime() + (slotA.durationMinutes + BUFFER_MINUTES) * 60 * 1000,
  );
  const bStart = new Date(slotB.startTime);
  const bEnd = new Date(
    bStart.getTime() + (slotB.durationMinutes + BUFFER_MINUTES) * 60 * 1000,
  );

  // Check for overlap (regardless of same date or not)
  const hasOverlap = !(aEnd <= bStart || aStart >= bEnd);
  if (hasOverlap) return "overlap";

  // Only check gaps for same-day bookings
  const isSameDate =
    aStart.getFullYear() === bStart.getFullYear() &&
    aStart.getMonth() === bStart.getMonth() &&
    aStart.getDate() === bStart.getDate();

  if (isSameDate) {
    if (aEnd <= bStart) {
      const gap = (bStart.getTime() - aEnd.getTime()) / 60000;
      if (gap < MIN_GAP_MINUTES) return "gap_too_small";
    } else if (bEnd <= aStart) {
      const gap = (aStart.getTime() - bEnd.getTime()) / 60000;
      if (gap < MIN_GAP_MINUTES) return "gap_too_small";
    }
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
    startTime: booking.bookingType.value,
    durationMinutes: booking.routeData.duration,
  };

  for (const scheduled of scheduledBookings) {
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
