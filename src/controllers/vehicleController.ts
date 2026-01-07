import { RequestHandler } from "express";
import { VehicleType } from "../models/Vehicle";

export const getVehicles: RequestHandler = async (req, res) => {
  const vehicleTypes = await VehicleType.find();
  if (!vehicleTypes)
    return res.status(404).json({ message: "Vehicle types not found" });
  res.json(vehicleTypes);
};
