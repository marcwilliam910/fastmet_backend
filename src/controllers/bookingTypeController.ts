import { RequestHandler } from "express";
import { BookingType } from "../models/BookingType";

export const getBookingTypes: RequestHandler = async (req, res) => {
  const bookingTypes = await BookingType.find({ isActive: true })
    .sort({
      order: 1,
    })
    .lean();
  res.json({ success: true, data: bookingTypes });
};
