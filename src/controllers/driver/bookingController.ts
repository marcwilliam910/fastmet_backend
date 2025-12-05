import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";
import mongoose from "mongoose";

// TODO: DELETE
// export const getPendingBookings: RequestHandler = async (req, res) => {
//   const pendingBookings = await BookingModel.find({
//     status: "pending",
//   }).sort({
//     createdAt: -1,
//   });
//   res.status(200).json(pendingBookings);
// };

export const getActiveBooking: RequestHandler = async (req, res) => {
  const { driverId } = req.params;
  const activeBooking = await BookingModel.findOne({
    status: "active",
    "driver.id": new mongoose.Types.ObjectId(driverId),
  });
  res.status(200).json(activeBooking);
};

export const updateBookingStatus: RequestHandler = async (req, res) => {
  const { bookingId } = req.params;
  const { status } = req.body;
  const updatedBooking = await BookingModel.findOneAndUpdate(
    { _id: bookingId },
    { status },
    { new: true }
  );
  res.status(200).json(updatedBooking);
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
