import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";
import mongoose from "mongoose";

export const getActiveBooking: RequestHandler = async (req, res) => {
  const { driverId } = req.params;
  const activeBooking = await BookingModel.findOne({
    status: "active",
    "driver.id": new mongoose.Types.ObjectId(driverId),
  });
  res.status(200).json(activeBooking);
};

export const getCompletedBookings: RequestHandler = async (req, res) => {
  const { driverId } = req.params;
  const { page = 1, limit = 5 } = req.query;

  if (!driverId) {
    return res.status(400).json({ message: "Missing user ID" });
  }

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const bookings = await BookingModel.find({
    "driver.id": new mongoose.Types.ObjectId(driverId),
    status: "completed",
  })
    .sort({ completedAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  console.log(bookings);

  // Get total count to know if there are more pages
  const total = await BookingModel.countDocuments({
    "driver.id": driverId,
    status: "completed",
  });

  res.status(200).json({
    bookings,
    nextPage: pageNum * limitNum < total ? pageNum + 1 : null,
  });
};
