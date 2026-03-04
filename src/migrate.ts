import mongoose from "mongoose";
import { BookingType } from "./models/BookingType";
import DriverModel from "./models/Driver";
import NotificationModel from "./models/Notification";
import { LocationDetails } from "./types/booking";
import { VehicleType } from "./models/Vehicle";

const poolingConfigs: Record<
  string,
  {
    maxRequests: number;
    maxDetourPercent: number;
    maxTotalDistanceKm: number;
    maxTotalTimeMinutes: number;
    basePickupRadiusKm: number;
    pickupRadiusGrowthPercent: number;
  }
> = {
  motorcycle: {
    maxRequests: 5,
    maxDetourPercent: 0.2,
    maxTotalDistanceKm: 300,
    maxTotalTimeMinutes: 480,
    basePickupRadiusKm: 1.5,
    pickupRadiusGrowthPercent: 0.04,
  },
  sedan: {
    maxRequests: 4,
    maxDetourPercent: 0.2,
    maxTotalDistanceKm: 400,
    maxTotalTimeMinutes: 600,
    basePickupRadiusKm: 2,
    pickupRadiusGrowthPercent: 0.04,
  },
  mpv_suv: {
    maxRequests: 4,
    maxDetourPercent: 0.2,
    maxTotalDistanceKm: 500,
    maxTotalTimeMinutes: 720,
    basePickupRadiusKm: 2,
    pickupRadiusGrowthPercent: 0.04,
  },
  light_van: {
    maxRequests: 4,
    maxDetourPercent: 0.2,
    maxTotalDistanceKm: 500,
    maxTotalTimeMinutes: 720,
    basePickupRadiusKm: 2,
    pickupRadiusGrowthPercent: 0.04,
  },
  small_pickup: {
    maxRequests: 4,
    maxDetourPercent: 0.15,
    maxTotalDistanceKm: 600,
    maxTotalTimeMinutes: 840,
    basePickupRadiusKm: 2.5,
    pickupRadiusGrowthPercent: 0.05,
  },
  l300: {
    maxRequests: 5,
    maxDetourPercent: 0.15,
    maxTotalDistanceKm: 700,
    maxTotalTimeMinutes: 960,
    basePickupRadiusKm: 3,
    pickupRadiusGrowthPercent: 0.05,
  },
  closed_van: {
    maxRequests: 3,
    maxDetourPercent: 0.1,
    maxTotalDistanceKm: 800,
    maxTotalTimeMinutes: 1080,
    basePickupRadiusKm: 3,
    pickupRadiusGrowthPercent: 0.05,
  },
  wing_van: {
    maxRequests: 2,
    maxDetourPercent: 0.08,
    maxTotalDistanceKm: 1200,
    maxTotalTimeMinutes: 1440,
    basePickupRadiusKm: 5,
    pickupRadiusGrowthPercent: 0.06,
  },
};

export const populate = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log("✅ Connected to MongoDB");

    const results = await Promise.all(
      Object.entries(poolingConfigs).map(async ([key, config]) => {
        const result = await VehicleType.findOneAndUpdate(
          { key },
          {
            $set: {
              "searchConfig.pooling": config,
            },
          },
          { new: true },
        );

        if (!result) {
          console.warn(`⚠️  Vehicle type not found: ${key}`);
          return { key, status: "not_found" };
        }

        console.log(
          `✅ Updated ${key}: maxRequests=${config.maxRequests}, ` +
            `maxDetourPercent=${config.maxDetourPercent}, ` +
            `maxTotalDistanceKm=${config.maxTotalDistanceKm}km, ` +
            `maxTotalTimeMinutes=${config.maxTotalTimeMinutes}min`,
        );
        return { key, status: "updated" };
      }),
    );

    const updated = results.filter((r) => r.status === "updated").length;
    const missing = results.filter((r) => r.status === "not_found").length;

    console.log(
      `\n📊 Migration complete: ${updated} updated, ${missing} not found`,
    );
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
};
