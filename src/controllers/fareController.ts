import { RequestHandler } from "express";
import Fare from "../models/Fare";
import FareModel from "../models/Fare";

export const getFareRates: RequestHandler = async (req, res) => {
  const fare = await Fare.findOne(); // assume only one document
  if (!fare) return res.status(404).json({ message: "Fare rates not found" });
  res.json(fare);
};

export const updateFareRates: RequestHandler = async (req, res) => {
  const { baseFare, perKmRate, perMinRate } = req.body;

  if (baseFare == null && perKmRate == null && perMinRate == null) {
    return res
      .status(400)
      .json({ message: "At least one fare rate must be provided." });
  }

  const fare = await FareModel.findOne();
  if (!fare) {
    return res.status(404).json({ message: "Fare settings not found." });
  }

  if (baseFare != null) fare.baseFare = baseFare;
  if (perKmRate != null) fare.perKmRate = perKmRate;
  if (perMinRate != null) fare.perMinRate = perMinRate;

  await fare.save();

  res.status(200).json({ message: "Fare updated successfully.", fare });
};
