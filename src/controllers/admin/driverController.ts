import { RequestHandler } from "express";
import DriverModel from "../../models/Driver";
import { getUserId } from "../../utils/helpers/getUserId";
import mongoose from "mongoose";

export const driverStatusUpdate: RequestHandler = async (req, res) => {
  const { approvalStatus } = req.body;
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
  const driverId = new mongoose.Types.ObjectId(userId);
  const driver = await DriverModel.findByIdAndUpdate(
    driverId,
    { approvalStatus },
    { new: true }
  );
  if (!driver) {
    return res.status(404).json({
      success: false,
      message: "Driver not found",
    });
  }
  return res.status(200).json({
    success: true,
    message: "Driver status updated",
    driver: {
      id: driver._id,
      approvalStatus: driver.approvalStatus,
    },
  });
};

export const approveAllDrivers: RequestHandler = async (req, res) => {
  const drivers = await DriverModel.updateMany(
    { approvalStatus: "pending" },
    { approvalStatus: "approved" }
  );
  if (!drivers) {
    return res.status(404).json({
      success: false,
      message: "No drivers found",
    });
  }
  return res.status(200).json({
    success: true,
    message: "All drivers approved",
    drivers: drivers.modifiedCount,
  });
};
