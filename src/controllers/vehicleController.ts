import { RequestHandler } from "express";
import { VehicleType } from "../models/Vehicle";

export const getVehicles: RequestHandler = async (req, res) => {
  const vehicleTypes = await VehicleType.find();

  if (!vehicleTypes || vehicleTypes.length === 0) {
    return res.status(404).json({ message: "Vehicle types not found" });
  }

  // Return just names if requested
  if (req.query.fields === "name") {
    return res.json(vehicleTypes.map((v) => ({ value: v._id, label: v.name })));
  }

  res.json(vehicleTypes);
};
