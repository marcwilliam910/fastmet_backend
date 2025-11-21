import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";

export const getPendingBookings: RequestHandler = async (req, res) => {
  const pendingBookings = await BookingModel.find({
    status: "pending",
    "bookingType.type": { $ne: "pooling" },
  }).sort({
    createdAt: -1,
  });
  res.status(200).json(pendingBookings);
};
