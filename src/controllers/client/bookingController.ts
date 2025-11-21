import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";

export const getBookings: RequestHandler = async (req, res) => {
  const { userId } = req.params;

  const bookings = await BookingModel.find({ userId }).sort({ createdAt: -1 });
  res.status(200).json(bookings);
};
