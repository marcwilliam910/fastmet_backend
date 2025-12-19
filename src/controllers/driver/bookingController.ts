import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";
import mongoose from "mongoose";
import { getUserId } from "../../utils/helpers/getUserId";

// not used currently
// export const getActiveBooking: RequestHandler = async (req, res) => {
//   const driverId = getUserId(req);
//   const activeBooking = await BookingModel.findOne({
//     status: "active",
//     "driver.id": new mongoose.Types.ObjectId(driverId),
//   })
//     .populate({
//       path: "customerId", // field that references User model
//       select: "fullName profilePictureUrl phoneNumber", // select needed fields
//     })
//     .lean(); // .lean() for plain JS object (optional, for better performance)

//   if (!activeBooking) {
//     return res.status(404).json({ message: "No active booking found" });
//   }

//   // Rename userId to client
//   const { customerId, ...rest } = activeBooking as any;
//   const formattedBooking = {
//     ...rest,
//     client: {
//       id: customerId._id,
//       name: customerId.fullName,
//       profilePictureUrl: customerId.profilePictureUrl,
//       phoneNumber: customerId.phoneNumber,
//     },
//   };

//   res.status(200).json(formattedBooking);
// };

export const getBookings: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);
  const { page = 1, limit = 5, status } = req.query;

  if (!driverId || !status) {
    return res.status(400).json({ message: "Missing user ID or status" });
  }

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const now = new Date();
  const lateThresholdMinutes = 30;

  const lateBoundary = new Date(
    now.getTime() - lateThresholdMinutes * 60 * 1000
  );

  const query: any = {
    "driver.id": new mongoose.Types.ObjectId(driverId),
    status,
  };

  if (status === "scheduled") {
    query["bookingType.value"] = {
      $gte: lateBoundary, // includes late (≤ 30 mins)
    };
  }

  const bookings = await BookingModel.find(query)
    .sort({ "bookingType.value": 1 }) // chronological for scheduled
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  // Get total count to know if there are more pages
  const total = await BookingModel.countDocuments({
    "driver.id": new mongoose.Types.ObjectId(driverId),
    status: status,
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

  const totalActiveBookings = await BookingModel.countDocuments({
    "driver.id": new mongoose.Types.ObjectId(driverId),
    status: "active",
  });

  const totalCompletedBookings = await BookingModel.countDocuments({
    "driver.id": new mongoose.Types.ObjectId(driverId),
    status: "completed",
  });

  const now = new Date();
  const lateThresholdMinutes = 30;

  const lateBoundary = new Date(
    now.getTime() - lateThresholdMinutes * 60 * 1000
  );

  const totalScheduledBookings = await BookingModel.countDocuments({
    "driver.id": new mongoose.Types.ObjectId(driverId),
    status: "scheduled",
    "bookingType.value": { $gte: lateBoundary },
  });

  res.status(200).json({
    totalActiveBookings,
    totalCompletedBookings,
    totalScheduledBookings,
  });
};
