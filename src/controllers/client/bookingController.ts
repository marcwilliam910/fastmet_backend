import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";
import mongoose, { Types } from "mongoose";
import { getUserId } from "../../utils/helpers/getUserId";
import cloudinary from "../../config/cloudinary";
import { equal } from "assert";

export const getBookingsByStatus: RequestHandler = async (req, res) => {
  const { userId } = req.params;
  const { status, page = 1, limit = 5 } = req.query;

  if (!userId) {
    return res.status(400).json({ message: "Missing user ID" });
  }

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const bookings = await BookingModel.find({
    customerId: new mongoose.Types.ObjectId(userId),
    status,
  })
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  // Get total count to know if there are more pages
  const total = await BookingModel.countDocuments({
    customerId: new mongoose.Types.ObjectId(userId),
    status,
  });

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
    { $match: { customerId: new mongoose.Types.ObjectId(userId) } },
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

export const uploadBookingImage: RequestHandler = async (req, res) => {
  try {
    const clientId = getUserId(req);
    const { bookingRef } = req.body;

    if (!clientId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!req.files || (req.files as any[]).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded",
      });
    }

    const files = req.files as Express.Multer.File[];

    // Parallel uploads instead of loop
    const uploadPromises = files.map((file, index) => {
      return new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `fastmet/clients/${clientId}/bookings/${bookingRef}`,
            public_id: `${Date.now()}-${index}`,
            resource_type: "image",
          },
          (error, result) => {
            if (error || !result) reject(error);
            else resolve(result.secure_url);
          }
        );
        stream.end(file.buffer);
      });
    });

    const images = await Promise.all(uploadPromises);

    return res.json({
      success: true,
      images,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Upload failed",
    });
  }
};
