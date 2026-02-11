import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";
import mongoose, { Types } from "mongoose";
import { getUserId } from "../../utils/helpers/getUserId";
import cloudinary from "../../config/cloudinary";
import DriverModel, { IDriverRating } from "../../models/Driver";
import {
  getSecureFolderId,
  uploadMultipleImagesToCloudinary,
} from "../../services/cloudinaryService";
import { RequestedDriver } from "../../types/booking";

export interface PopulatedDriver {
  _id: mongoose.Types.ObjectId;
  firstName: string;
  lastName: string;
  rating: IDriverRating;
  profilePictureUrl: string;
  phoneNumber: string;
  images: {
    frontView: string;
  };
}
export interface LeanBooking {
  _id: Types.ObjectId;
  status: string;
  createdAt: Date;
  driverId?: PopulatedDriver | null;
  requestedDrivers?: PopulatedDriver[];
}

export const getBookingsByStatus: RequestHandler = async (req, res) => {
  const clientId = getUserId(req);
  if (!clientId) {
    return res.status(400).json({ message: "Missing user ID" });
  }

  const { status, page = 1, limit = 5 } = req.query;

  const pageNum = Number(page);
  const limitNum = Number(limit);

  /* -------------------------------------------------
       1. Fetch paginated bookings
    -------------------------------------------------- */
  const bookings = await BookingModel.find({
    customerId: new mongoose.Types.ObjectId(clientId),
    status,
  })
    .populate("driverId", "_id firstName lastName rating profilePictureUrl")
    .populate({
      path: "requestedDrivers",
      select: "_id firstName lastName rating profilePictureUrl images",
    })
    .populate({
      path: "selectedVehicle.vehicleTypeId",
      select: "name freeServices",
    })
    .sort(
      status === "cancelled"
        ? { cancelledAt: -1, _id: -1 }
        : { createdAt: -1, _id: -1 },
    )
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean<LeanBooking[]>();

  /* -------------------------------------------------
       2. Collect ALL requested driver IDs (once)
    -------------------------------------------------- */
  const requestedDriverIds = bookings
    .flatMap((b) => b.requestedDrivers ?? [])
    .map((d) => d._id);

  /* -------------------------------------------------
       3. Aggregate completed bookings per driver (ONE query)
    -------------------------------------------------- */
  let completedMap = new Map<string, number>();

  if (requestedDriverIds.length > 0) {
    const completedCounts = await BookingModel.aggregate([
      {
        $match: {
          driverId: { $in: requestedDriverIds },
          status: "completed",
        },
      },
      {
        $group: {
          _id: "$driverId",
          total: { $sum: 1 },
        },
      },
    ]);

    completedMap = new Map(
      completedCounts.map((d) => [d._id.toString(), d.total]),
    );
  }

  /* -------------------------------------------------
       4. Format response
    -------------------------------------------------- */
  const formattedBookings = bookings.map((booking) => {
    const driver = booking.driverId || null;
    const requestedDrivers = booking.requestedDrivers || [];

    const formattedRequestedDrivers =
      booking.status === "pending"
        ? requestedDrivers.map((reqDriver: any) => ({
            id: reqDriver._id.toString(),
            name: `${reqDriver.firstName} ${reqDriver.lastName}`,
            rating: reqDriver.rating.average,
            profilePicture: reqDriver.profilePictureUrl || "",
            vehicleImage: reqDriver.images?.frontView || "",
            totalBookings: completedMap.get(reqDriver._id.toString()) ?? 0,
          }))
        : [];

    const {
      driverId,
      requestedDrivers: _,
      selectedVehicle,
      ...bookingData
    } = booking as any;

    return {
      ...bookingData,
      driver: driver
        ? {
            id: driver._id,
            name: `${driver.firstName} ${driver.lastName}`,
            rating: driver.rating.average,
            profilePictureUrl: driver.profilePictureUrl,
          }
        : null,
      requestedDrivers: formattedRequestedDrivers,
      selectedVehicle: {
        name: selectedVehicle?.vehicleTypeId?.name || null,
        freeServices: selectedVehicle?.vehicleTypeId?.freeServices || [],
      },
    };
  });

  /* -------------------------------------------------
       5. Correct pagination count
    -------------------------------------------------- */
  const total = await BookingModel.countDocuments({
    customerId: new mongoose.Types.ObjectId(clientId),
    status,
  });

  res.status(200).json({
    bookings: formattedBookings,
    nextPage: pageNum * limitNum < total ? pageNum + 1 : null,
  });
};

export const getBooking: RequestHandler = async (req, res) => {
  const { bookingId } = req.params;

  if (!Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({ message: "Invalid booking ID format" });
  }
  const booking = await BookingModel.findById(bookingId)
    .populate("driverId", "_id firstName lastName rating profilePictureUrl")
    .populate({
      path: "selectedVehicle.vehicleTypeId",
      select: "name freeServices",
    })
    .lean();

  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const { driverId, selectedVehicle, ...bookingData } = booking as any;
  const driver = booking.driverId as PopulatedDriver | null;

  const formattedBooking = {
    ...bookingData,
    driver: driver
      ? {
          id: driver._id,
          name: driver.firstName + " " + driver.lastName,
          rating: driver.rating.average,
          profilePictureUrl: driver.profilePictureUrl,
        }
      : null,
    selectedVehicle: {
      name: selectedVehicle?.vehicleTypeId?.name || null,
      freeServices: selectedVehicle?.vehicleTypeId?.freeServices || [],
    },
  };

  res.status(200).json(formattedBooking);
};

export const getBookingsCount: RequestHandler = async (req, res) => {
  const clientId = getUserId(req);

  if (!clientId) {
    return res.status(400).json({ message: "Missing user ID" });
  }

  // Main aggregation: total count by status
  const result = await BookingModel.aggregate([
    { $match: { customerId: new mongoose.Types.ObjectId(clientId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // Aggregation for unread completed/cancelled counts (clientRead: false)
  const unreadCountsAgg = await BookingModel.aggregate([
    {
      $match: {
        customerId: new mongoose.Types.ObjectId(clientId),
        clientRead: false,
        status: { $in: ["completed", "cancelled"] },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // Convert main aggregation result to object
  const counts: Record<string, number> = {
    pending: 0,
    scheduled: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
  };

  for (const r of result) {
    counts[r._id] = r.count;
  }

  // Handle possible implicit 'any' type error
  let unreadCompleted = 0;
  let unreadCancelled = 0;
  for (const r of unreadCountsAgg) {
    if (r._id === "completed") {
      unreadCompleted = r.count;
    } else if (r._id === "cancelled") {
      unreadCancelled = r.count;
    }
  }

  res.status(200).json({
    pending: counts.pending + counts.scheduled,
    active: counts.active,
    completed: unreadCompleted,
    cancelled: unreadCancelled,
  });
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

    // Upload with compression using the reusable service
    const images = await uploadMultipleImagesToCloudinary(
      files,
      `fastmet/clients/${getSecureFolderId(clientId)}/bookings/${bookingRef}`,
      "booking", // Uses booking config: 1200px, 80% quality
    );

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

export const rateDriver: RequestHandler = async (req, res) => {
  const { rating } = req.body;
  const { bookingId } = req.params;

  // Validation
  if (!Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({ message: "Invalid booking ID format" });
  }

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: "Rating must be between 1 and 5" });
  }

  // Find booking
  const booking = await BookingModel.findById(bookingId);

  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  // Check if booking has a driver
  if (!booking.driverId) {
    return res
      .status(400)
      .json({ message: "No driver assigned to this booking" });
  }

  // Check if already rated
  if (booking.driverRating !== null) {
    return res
      .status(400)
      .json({ message: "Driver already rated for this booking" });
  }

  // Update booking with rating
  booking.driverRating = rating;
  await booking.save();

  // Update driver's average rating
  const driver = await DriverModel.findById(booking.driverId);

  if (!driver) {
    return res.status(404).json({ message: "Driver not found" });
  }

  // Calculate new average
  driver.rating.total += rating;
  driver.rating.count += 1;
  driver.rating.average =
    Math.round((driver.rating.total / driver.rating.count) * 10) / 10; // Round to 1 decimal

  await driver.save();

  res.status(200).json({
    message: "Driver rated successfully",
    driverRating: {
      average: driver.rating.average,
      count: driver.rating.count,
    },
  });
};

export const updatePartialBookingData: RequestHandler = async (req, res) => {
  const { bookingId } = req.params;
  const updateData = req.body;

  if (!Types.ObjectId.isValid(bookingId)) {
    return res.status(400).json({ message: "Invalid booking ID format" });
  }

  const booking = await BookingModel.findById(bookingId);

  if (!booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  const updatedBooking = await BookingModel.findOneAndUpdate(
    { _id: bookingId },
    { $set: updateData },
    { new: true },
  );

  res.status(200).json(updatedBooking);
};

export const markBookingAsRead: RequestHandler = async (req, res) => {
  const clientId = getUserId(req);

  if (!clientId) {
    return res.status(400).json({ message: "Missing user ID" });
  }

  const { status } = req.params as { status: "completed" | "cancelled" };
  console.log(status);

  if (!status || !["completed", "cancelled"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const result = await BookingModel.updateMany(
    { customerId: new mongoose.Types.ObjectId(clientId), status },
    { clientRead: true },
  );

  res.status(200).json({
    message: "Bookings marked as read",
    modifiedCount: result.modifiedCount,
  });
};
