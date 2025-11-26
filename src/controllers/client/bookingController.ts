import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";

export const getBookings: RequestHandler = async (req, res) => {
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
