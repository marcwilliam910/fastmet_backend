import { BookingType } from "./models/BookingType";
import DriverModel from "./models/Driver";
import NotificationModel from "./models/Notification";
import { LocationDetails } from "./types/booking";

const bookingTypeSeeds = [
  {
    key: "asap",
    name: "ASAP",
    icon: "rocket-outline",
    description:
      "The ASAP option prioritizes immediate dispatch. Once your booking is confirmed, the system automatically searches for the nearest available driver and assigns the job as quickly as possible. This is ideal for urgent deliveries, time-sensitive pickups, or situations where delays may impact operations.",
    priceModifier: 1.0, // not used directly — sub-options take over
    order: 1,
    subOptions: [
      {
        key: "REGULAR",
        name: "Regular",
        icon: "time-outline",
        subtext: "Standard • pickup in ~2hrs",
        description:
          "Standard dispatch with no priority surcharge. Your booking enters the normal queue and a driver is assigned based on proximity and availability.",
        priceModifier: 1.0, // no change to distanceFee
        isActive: true,
        order: 1,
      },
      {
        key: "PRIORITY",
        name: "Priority",
        icon: "flash-outline",
        subtext: "Quickest • pickup in <1hr",
        description:
          "Priority dispatch bumps your booking to the front of the queue. The nearest available driver is assigned immediately. A 10% surcharge is added to the distance fee in exchange for faster service.",
        priceModifier: 1.1, // +10% on distanceFee
        isActive: true,
        order: 2,
      },
    ],
    isActive: true,
  },
  {
    key: "pooling",
    name: "Pooling",
    icon: "people-outline",
    subtext: "Most affordable – share ride with others",
    description:
      "Pooling allows your booking to be grouped with other requests that have similar routes and destinations. This option optimizes vehicle capacity and reduces overall transport costs by sharing space and travel time. Best suited for non-urgent shipments where cost efficiency is a priority.",
    priceModifier: 0.9, // -10% on distanceFee
    order: 2,
    subOptions: [],
    isActive: true,
  },
  {
    key: "schedule",
    name: "Schedule",
    icon: "calendar-outline",
    subtext: "Book up to 1 month in advance",
    description:
      "The Schedule option lets you pre-book a vehicle at a specific date and time, up to one month in advance. Recommended for planned logistics operations such as scheduled deliveries, recurring pickups, or coordinated transport activities.",
    priceModifier: 1.0, // no price change for scheduled bookings
    order: 3,
    subOptions: [],
    isActive: true,
  },
];

export const seedBookingTypes = async () => {
  try {
    for (const seed of bookingTypeSeeds) {
      await BookingType.findOneAndUpdate(
        { key: seed.key },
        { $set: seed },
        { upsert: true, new: true },
      );
    }
    console.log("✅ BookingType seeded successfully");
  } catch (error) {
    console.error("❌ BookingType seed failed:", error);
    throw error;
  }
};

// Export for direct use
export default {
  seedBookingTypes,
};
