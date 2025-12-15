import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";
import mongoose from "mongoose";
import { getUserId } from "../../utils/getUserId";

// not used currently
export const getActiveBooking: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);
  const activeBooking = await BookingModel.findOne({
    status: "active",
    "driver.id": new mongoose.Types.ObjectId(driverId),
  })
    .populate({
      path: "customerId", // field that references User model
      select: "fullName profilePictureUrl phoneNumber", // select needed fields
    })
    .lean(); // .lean() for plain JS object (optional, for better performance)

  if (!activeBooking) {
    return res.status(404).json({ message: "No active booking found" });
  }

  // Rename userId to client
  const { customerId, ...rest } = activeBooking as any;
  const formattedBooking = {
    ...rest,
    client: {
      id: customerId._id,
      name: customerId.fullName,
      profilePictureUrl: customerId.profilePictureUrl,
      phoneNumber: customerId.phoneNumber,
    },
  };

  res.status(200).json(formattedBooking);
};

export const getCompletedBookings: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);
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
    "driver.id": new mongoose.Types.ObjectId(driverId),
    status: "completed",
  });

  res.status(200).json({
    bookings,
    nextPage: pageNum * limitNum < total ? pageNum + 1 : null,
  });
};

export const getTotalCompletedAndScheduledBookings: RequestHandler = async (
  req,
  res
) => {
  const driverId = getUserId(req);

  if (!driverId) {
    return res.status(400).json({ message: "Missing user ID" });
  }

  const totalCompletedBookings = await BookingModel.countDocuments({
    "driver.id": new mongoose.Types.ObjectId(driverId),
    status: "completed",
  });

  const totalScheduledBookings = await BookingModel.countDocuments({
    "driver.id": new mongoose.Types.ObjectId(driverId),
    status: "scheduled",
  });

  res.status(200).json({
    totalCompletedBookings,
    totalScheduledBookings,
  });
};
