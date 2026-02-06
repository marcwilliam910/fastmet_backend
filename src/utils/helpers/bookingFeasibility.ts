import BookingModel, { IBooking } from "../../models/Booking";

const BUFFER_MINUTES = 15;
const MIN_GAP_MINUTES = 20;

type FeasibilityResult = { ok: true } | { ok: false; reason: string };

export const canAcceptScheduledBooking = async (
  bookingId: string,
  existingBookings: IBooking[],
): Promise<FeasibilityResult> => {
  const booking = await BookingModel.findById(bookingId);
  if (!booking) {
    return { ok: false, reason: "Booking not found." };
  }

  const newStart = new Date(booking.bookingType.value);
  const newEnd = new Date(
    newStart.getTime() +
      (booking.routeData.duration + BUFFER_MINUTES) * 60 * 1000,
  );

  for (const existing of existingBookings) {
    const existingStart = new Date(existing.bookingType.value);
    const existingEnd = new Date(
      existingStart.getTime() +
        (existing.routeData.duration + BUFFER_MINUTES) * 60 * 1000,
    );

    // Only check if the dates (year, month, day) are the same—i.e., same calendar day bookings
    const isSameDate =
      existingStart.getFullYear() === newStart.getFullYear() &&
      existingStart.getMonth() === newStart.getMonth() &&
      existingStart.getDate() === newStart.getDate();

    if (isSameDate) {
      // Overlap check for same date
      if (!(newEnd <= existingStart || newStart >= existingEnd)) {
        return {
          ok: false,
          reason:
            "This booking overlaps with another scheduled trip on the same day.",
        };
      }

      // New booking ends before existing booking starts: Check gap
      if (newEnd <= existingStart) {
        const gap = (existingStart.getTime() - newEnd.getTime()) / 60000;
        if (gap < MIN_GAP_MINUTES) {
          return {
            ok: false,
            reason: "Not enough time to travel to the next scheduled pickup.",
          };
        }
      }

      // Existing booking ends before new booking starts: Check gap
      if (existingEnd <= newStart) {
        const gap = (newStart.getTime() - existingEnd.getTime()) / 60000;
        if (gap < MIN_GAP_MINUTES) {
          return {
            ok: false,
            reason: "Not enough time after the previous scheduled trip.",
          };
        }
      }
    } else {
      // For different dates but back-to-back (e.g. midnight overlap) -- check if timespans overlap
      if (!(newEnd <= existingStart || newStart >= existingEnd)) {
        return {
          ok: false,
          reason: "This booking overlaps with another scheduled trip.",
        };
      }
      // Otherwise, we don't check feasibility gap for bookings on separate days
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

  const newStart = new Date(booking.bookingType.value);
  const newEnd = new Date(
    newStart.getTime() +
      (booking.routeData.duration + BUFFER_MINUTES) * 60 * 1000,
  );

  for (const scheduled of scheduledBookings) {
    const scheduledStart = new Date(scheduled.bookingType.value);
    const scheduledEnd = new Date(
      scheduledStart.getTime() +
        (scheduled.routeData.duration + BUFFER_MINUTES) * 60 * 1000,
    );

    // Check if on same calendar date
    const isSameDate =
      newStart.getFullYear() === scheduledStart.getFullYear() &&
      newStart.getMonth() === scheduledStart.getMonth() &&
      newStart.getDate() === scheduledStart.getDate();

    if (isSameDate) {
      // 1️⃣ HARD overlap for same date
      if (scheduledStart < newEnd && scheduledEnd > newStart) {
        return {
          ok: false,
          reason:
            "Cannot offer service for this ASAP booking because it conflicts with a scheduled booking on the same day.",
        };
      }

      // 2️⃣ FEASIBILITY GAP for same day
      // ASAP ends before scheduled starts
      if (newEnd <= scheduledStart) {
        const gap = (scheduledStart.getTime() - newEnd.getTime()) / 60000;
        if (gap < MIN_GAP_MINUTES) {
          return {
            ok: false,
            reason: "Not enough time to travel to the next scheduled pickup.",
          };
        }
      }

      // Scheduled ends before ASAP starts (almost impossible, but safe)
      if (scheduledEnd <= newStart) {
        const gap = (newStart.getTime() - scheduledEnd.getTime()) / 60000;
        if (gap < MIN_GAP_MINUTES) {
          return {
            ok: false,
            reason: "Not enough time after the previous scheduled trip.",
          };
        }
      }
    } else {
      // If not the same standard day, check for any overlap (e.g., overnight/midnight bookings)
      if (!(newEnd <= scheduledStart || newStart >= scheduledEnd)) {
        return {
          ok: false,
          reason:
            "Cannot offer service for this ASAP booking because it conflicts with a scheduled booking.",
        };
      }
      // No feasibility gap check across different days
    }
  }

  return { ok: true };
};
