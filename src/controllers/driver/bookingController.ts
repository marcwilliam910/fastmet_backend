import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";

// TODO: DELETE
export const getPendingBookings: RequestHandler = async (req, res) => {
  const pendingBookings = await BookingModel.find({
    status: "pending",
  }).sort({
    createdAt: -1,
  });
  res.status(200).json(pendingBookings);
};

export const getActiveBookings: RequestHandler = async (req, res) => {
  const { driverId } = req.params;
  const activeBookings = await BookingModel.find({
    status: "active",
    "driver.id": driverId,
  }).sort({
    createdAt: -1,
  });
  res.status(200).json(activeBookings);
};
