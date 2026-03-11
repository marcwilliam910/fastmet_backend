import { RequestHandler } from "express";
import { VehicleType } from "../models/Vehicle";
import redis from "../config/redis";

const CACHE_KEY_FULL = "vehicle_types:full";
const CACHE_KEY_NAMES = "vehicle_types:names";
const CACHE_KEY_PREREGISTER = "vehicle_types:preregister";

export const getVehicles: RequestHandler = async (req, res) => {
  const fields = req.query.fields as string | undefined;
  // ── name only (client app dropdown) ──────────────────────────────────────
  if (fields === "name") {
    const cached = await redis.get(CACHE_KEY_NAMES);
    if (cached) return res.json(JSON.parse(cached));

    const vehicleTypes = await VehicleType.find({ isActive: true })
      .select("_id name key variants")
      .lean();

    if (!vehicleTypes.length)
      return res.status(404).json({ message: "Vehicle types not found" });

    const data = vehicleTypes.map((v) => ({
      value: v._id,
      label: v.name,
      key: v.key,
      variants: v.variants
        .filter((variant) => variant.isActive)
        .map((variant) => ({
          label: variant.maxLoadKg,
          value: variant._id,
        })),
    }));

    await redis.set(CACHE_KEY_NAMES, JSON.stringify(data));
    return res.json(data);
  }

  // ── pre-register (driver web form) ───────────────────────────────────────
  if (fields === "preregister") {
    const cached = await redis.get(CACHE_KEY_PREREGISTER);
    if (cached) return res.json(JSON.parse(cached));

    const vehicleTypes = await VehicleType.find({ isActive: true })
      .select("_id name imageUrl variants key")
      .lean();

    if (!vehicleTypes.length)
      return res.status(404).json({ message: "Vehicle types not found" });

    const data = vehicleTypes.map((v) => ({
      _id: v._id,
      name: v.name,
      imageUrl: v.imageUrl,
      variants: v.variants
        .filter((variant) => variant.isActive)
        .map((variant) => ({
          _id: variant._id,
          maxLoadKg: variant.maxLoadKg,
          isActive: variant.isActive,
        })),
    }));

    await redis.set(CACHE_KEY_PREREGISTER, JSON.stringify(data));
    return res.json(data);
  }

  // ── full data (admin or internal) ─────────────────────────────────────────
  const cached = await redis.get(CACHE_KEY_FULL);
  if (cached) return res.json(JSON.parse(cached));

  const vehicleTypes = await VehicleType.find({ isActive: true }).lean();

  if (!vehicleTypes.length)
    return res.status(404).json({ message: "Vehicle types not found" });

  await redis.set(CACHE_KEY_FULL, JSON.stringify(vehicleTypes));
  return res.json(vehicleTypes);
};
