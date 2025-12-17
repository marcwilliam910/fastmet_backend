import BookingModel from "../../models/Booking";

const BUFFER_MINUTES = 15;
const MIN_GAP_MINUTES = 20;

type FeasibilityResult = { ok: true } | { ok: false; reason: string };

export const canAcceptScheduledBooking = async (
  bookingId: string,
  driverId: string
): Promise<FeasibilityResult> => {
  const booking = await BookingModel.findById(bookingId);
  if (!booking) {
    return { ok: false, reason: "Booking not found." };
  }

  if (booking.bookingType.type !== "schedule") {
    return { ok: true };
  }

  const newStart = new Date(booking.bookingType.value);
  const newEnd = new Date(
    newStart.getTime() +
      (booking.routeData.duration + BUFFER_MINUTES) * 60 * 1000
  );

  const existingBookings = await BookingModel.find({
    "driver.id": driverId,
    status: "scheduled",
    "bookingType.type": "schedule",
  });

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
