import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";
import { Types } from "mongoose";

export const getBookingsByStatus: RequestHandler = async (req, res) => {
  const { userId } = req.params;
  const { status, page = 1, limit = 5 } = req.query;

  if (!userId) {
    return res.status(400).json({ message: "Missing user ID" });
  }

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const bookings = await BookingModel.find({ userId, status })
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  // Get total count to know if there are more pages
  const total = await BookingModel.countDocuments({ userId, status });

  res.status(200).json({
    bookings,
    nextPage: pageNum * limitNum < total ? pageNum + 1 : null,
  });
};

export const getBooking: RequestHandler = async (req, res) => {
  const { bookingId } = req.params;

  // Validate MongoDB ObjectId
  if (!Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({ message: "Invalid booking ID format" });
  }
  const booking = await BookingModel.findById(bookingId);

  console.log(JSON.stringify(booking, null, 2));
  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  res.status(200).json(booking);
};

export const getBookingsCount: RequestHandler = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: "Missing user ID" });
  }

  const result = await BookingModel.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // Convert aggregation result to clean object:
  const counts: Record<string, number> = {
    pending: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
  };

  for (const r of result) {
    counts[r._id] = r.count;
  }

  res.status(200).json(counts);
};
