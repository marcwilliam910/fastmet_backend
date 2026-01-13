import BookingModel, { IBooking } from "../../models/Booking";

const BUFFER_MINUTES = 15;
const MIN_GAP_MINUTES = 20;

type FeasibilityResult = { ok: true } | { ok: false; reason: string };

export const canAcceptScheduledBooking = async (
  bookingId: string,
  existingBookings: IBooking[]
): Promise<FeasibilityResult> => {
  const booking = await BookingModel.findById(bookingId);
  if (!booking) {
    return { ok: false, reason: "Booking not found." };
  }

  const newStart = new Date(booking.bookingType.value);
  const newEnd = new Date(
    newStart.getTime() +
      (booking.routeData.duration + BUFFER_MINUTES) * 60 * 1000
  );

  for (const existing of existingBookings) {
    const existingStart = new Date(existing.bookingType.value);
    const existingEnd = new Date(
      existingStart.getTime() +
        (existing.routeData.duration + BUFFER_MINUTES) * 60 * 1000
    );

    // 1️⃣ HARD overlap
    if (existingStart < newEnd && existingEnd > newStart) {
      return {
        ok: false,
        reason: "This booking overlaps with another scheduled trip.",
      };
    }

    // 2️⃣ FEASIBILITY GAP
    if (newEnd <= existingStart) {
      const gap = (existingStart.getTime() - newEnd.getTime()) / 60000;
      if (gap < MIN_GAP_MINUTES) {
        return {
          ok: false,
          reason: "Not enough time to travel to the next scheduled pickup.",
        };
      }
    }

    if (existingEnd <= newStart) {
      const gap = (newStart.getTime() - existingEnd.getTime()) / 60000;
      if (gap < MIN_GAP_MINUTES) {
        return {
          ok: false,
          reason: "Not enough time after the previous scheduled trip.",
        };
      }
    }
  }

  return { ok: true };
};

export const canAcceptAsapBooking = async (
  bookingId: string,
  scheduledBookings: IBooking[]
): Promise<FeasibilityResult> => {
  const booking = await BookingModel.findById(bookingId);
  if (!booking) {
    return { ok: false, reason: "Booking not found." };
  }

  if (booking.status !== "pending") {
    return {
      ok: false,
      reason: "This booking is no longer available",
    };
  }

  const newStart = new Date(booking.bookingType.value);
  const newEnd = new Date(
    newStart.getTime() +
      (booking.routeData.duration + BUFFER_MINUTES) * 60 * 1000
  );

  for (const scheduled of scheduledBookings) {
    const scheduledStart = new Date(scheduled.bookingType.value);
    const scheduledEnd = new Date(
      scheduledStart.getTime() +
        (scheduled.routeData.duration + BUFFER_MINUTES) * 60 * 1000
    );

    // 1️⃣ HARD overlap
    if (scheduledStart < newEnd && scheduledEnd > newStart) {
      return {
        ok: false,
        reason:
          "Cannot offer service for this ASAP booking because it conflicts with a scheduled booking.",
      };
    }

    // 2️⃣ FEASIBILITY GAP
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

    // Scheduled ends before ASAP starts (almost impossible, but safe) //maybe can be deleted
    if (scheduledEnd <= newStart) {
      const gap = (newStart.getTime() - scheduledEnd.getTime()) / 60000;
      if (gap < MIN_GAP_MINUTES) {
        return {
          ok: false,
          reason: "Not enough time after the previous scheduled trip.",
        };
      }
    }
  }

  return { ok: true };
};
