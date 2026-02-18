import DriverModel from "./models/Driver";
import NotificationModel from "./models/Notification";
import { LocationDetails } from "./types/booking";
const CLIENT_USER_ID = "698587014a773324bae9b4a8";

// Dummy location data
const SAMPLE_LOCATIONS = {
  pickUp1: {
    name: "SM City North EDSA",
    address: "North Avenue, Quezon City, Metro Manila",
    coords: {
      lat: 14.6564,
      lng: 121.0298,
    },
  } as LocationDetails,
  dropOff1: {
    name: "Bonifacio Global City",
    address: "26th Street, Taguig, Metro Manila",
    coords: {
      lat: 14.5515,
      lng: 121.0473,
    },
  } as LocationDetails,
  pickUp2: {
    name: "Ayala Center Cebu",
    address: "Cebu Business Park, Cebu City",
    coords: {
      lat: 10.3181,
      lng: 123.906,
    },
  } as LocationDetails,
  dropOff2: {
    name: "Mactan-Cebu International Airport",
    address: "Lapu-Lapu City, Cebu",
    coords: {
      lat: 10.3075,
      lng: 123.9792,
    },
  } as LocationDetails,
  pickUp3: {
    name: "Robinsons Galleria",
    address: "EDSA corner Ortigas Avenue, Quezon City",
    coords: {
      lat: 14.6197,
      lng: 121.0569,
    },
  } as LocationDetails,
  dropOff3: {
    name: "NAIA Terminal 3",
    address: "Andrews Avenue, Pasay City",
    coords: {
      lat: 14.5086,
      lng: 121.0198,
    },
  } as LocationDetails,
  pickUp4: {
    name: "Greenhills Shopping Center",
    address: "Ortigas Avenue, San Juan City",
    coords: {
      lat: 14.6019,
      lng: 121.0515,
    },
  } as LocationDetails,
  dropOff4: {
    name: "Mall of Asia",
    address: "Seaside Boulevard, Pasay City",
    coords: {
      lat: 14.5352,
      lng: 120.9829,
    },
  } as LocationDetails,
};

// Sample notifications data
const SAMPLE_NOTIFICATIONS = [
  // 1. Driver Offer - Multiple drivers
  {
    userId: CLIENT_USER_ID,
    userType: "Client",
    title: "New Driver Offers",
    message:
      "You have 3 driver offers for your delivery request. Choose your preferred driver now!",
    type: "driver_offer",
    data: {
      bookingId: "64f1a2b3c4d5e6f7a8b9c0e1",
      pickUp: SAMPLE_LOCATIONS.pickUp1,
      dropOff: SAMPLE_LOCATIONS.dropOff1,
      drivers: {
        "64f1a2b3c4d5e6f7a8b9c0d1": {
          driverName: "Juan Dela Cruz",
          driverRating: 4.8,
          driverProfilePicture:
            "https://randomuser.me/api/portraits/men/32.jpg",
        },
        "64f1a2b3c4d5e6f7a8b9c0d2": {
          driverName: "Maria Santos",
          driverRating: 4.9,
          driverProfilePicture:
            "https://randomuser.me/api/portraits/women/44.jpg",
        },
        "64f1a2b3c4d5e6f7a8b9c0d3": {
          driverName: "Pedro Reyes",
          driverRating: 4.7,
          driverProfilePicture:
            "https://randomuser.me/api/portraits/men/67.jpg",
        },
      },
    },
    isRead: false,
  },

  // 2. Driver Offer - Single driver
  {
    userId: CLIENT_USER_ID,
    userType: "Client",
    title: "New Driver Offer",
    message: "A driver is interested in your delivery request!",
    type: "driver_offer",
    data: {
      bookingId: "64f1a2b3c4d5e6f7a8b9c0e2",
      pickUp: SAMPLE_LOCATIONS.pickUp2,
      dropOff: SAMPLE_LOCATIONS.dropOff2,
      drivers: {
        "64f1a2b3c4d5e6f7a8b9c0d4": {
          driverName: "Ana Garcia",
          driverRating: 4.95,
          driverProfilePicture:
            "https://randomuser.me/api/portraits/women/65.jpg",
        },
      },
    },
    isRead: false,
  },

  // 3. Booking Expired
  {
    userId: CLIENT_USER_ID,
    userType: "Client",
    title: "Booking Expired",
    message:
      "10 minutes has passed but no drivers were available for your delivery request.",
    type: "booking_expired",
    data: {
      bookingId: "64f1a2b3c4d5e6f7a8b9c0e3",
      pickUp: SAMPLE_LOCATIONS.pickUp3,
      dropOff: SAMPLE_LOCATIONS.dropOff3,
    },
    isRead: false,
  },

  // 4. Scheduled Choose Driver
  {
    userId: CLIENT_USER_ID,
    userType: "Client",
    title: "Choose your driver",
    message:
      "You have 2 offer(s) for your tomorrow 9:00 AM pickup. Select one now!",
    type: "scheduled_choose_driver",
    data: {
      pickUp: SAMPLE_LOCATIONS.pickUp4,
      dropOff: SAMPLE_LOCATIONS.dropOff4,
      bookingId: "64f1a2b3c4d5e6f7a8b9c0e4",
    },
    isRead: false,
  },

  // 5. Scheduled No Drivers
  {
    userId: CLIENT_USER_ID,
    userType: "Client",
    title: "No drivers available yet",
    message:
      "No drivers have offered for your tomorrow 2:00 PM pickup. Consider rescheduling or cancelling.",
    type: "scheduled_no_drivers",
    data: {
      pickUp: SAMPLE_LOCATIONS.pickUp1,
      dropOff: SAMPLE_LOCATIONS.dropOff2,
      bookingId: "64f1a2b3c4d5e6f7a8b9c0e5",
    },
    isRead: false,
  },

  // 6. Scheduled Auto Assign Warning
  {
    userId: CLIENT_USER_ID,
    userType: "Client",
    title: "Driver will be auto-assigned in 1 hour",
    message:
      "Choose your preferred driver or we'll assign the highest-rated one.",
    type: "scheduled_auto_assign_warning",
    data: {
      pickUp: SAMPLE_LOCATIONS.pickUp2,
      dropOff: SAMPLE_LOCATIONS.dropOff3,
      bookingId: "64f1a2b3c4d5e6f7a8b9c0e6",
    },
    isRead: true,
  },

  // 7. Scheduled Auto Assigned
  {
    userId: CLIENT_USER_ID,
    userType: "Client",
    title: "Driver auto-assigned",
    message: "We've assigned Juan Dela Cruz to your booking.",
    type: "scheduled_auto_assigned",
    data: {
      bookingId: "64f1a2b3c4d5e6f7a8b9c0e7",
      pickUp: SAMPLE_LOCATIONS.pickUp3,
      dropOff: SAMPLE_LOCATIONS.dropOff4,
      driverId: "64f1a2b3c4d5e6f7a8b9c0d1",
      driverName: "Juan Dela Cruz",
      driverRating: 4.8,
      driverProfilePicture: "https://randomuser.me/api/portraits/men/32.jpg",
    },
    isRead: true,
  },

  // 8. Scheduled Auto Cancelled
  {
    userId: CLIENT_USER_ID,
    userType: "Client",
    title: "Booking cancelled",
    message:
      "We couldn't find available drivers for your scheduled pickup. Please try again or reschedule.",
    type: "scheduled_auto_cancelled",
    data: {
      pickUp: SAMPLE_LOCATIONS.pickUp4,
      dropOff: SAMPLE_LOCATIONS.dropOff1,
      bookingId: "64f1a2b3c4d5e6f7a8b9c0e8",
    },
    isRead: true,
  },

  // 9. Another Driver Offer (Read)
  {
    userId: CLIENT_USER_ID,
    userType: "Client",
    title: "New Driver Offer",
    message: "A driver is interested in your delivery request!",
    type: "driver_offer",
    data: {
      bookingId: "64f1a2b3c4d5e6f7a8b9c0e9",
      pickUp: SAMPLE_LOCATIONS.pickUp1,
      dropOff: SAMPLE_LOCATIONS.dropOff4,
      drivers: {
        "64f1a2b3c4d5e6f7a8b9c0d5": {
          driverName: "Carlos Mendoza",
          driverRating: 4.6,
          driverProfilePicture:
            "https://randomuser.me/api/portraits/men/22.jpg",
        },
        "64f1a2b3c4d5e6f7a8b9c0d6": {
          driverName: "Sofia Ramos",
          driverRating: 4.85,
          driverProfilePicture:
            "https://randomuser.me/api/portraits/women/33.jpg",
        },
      },
    },
    isRead: true,
  },

  // 10. Scheduled Auto Assigned (Another example)
  {
    userId: CLIENT_USER_ID,
    userType: "Client",
    title: "Driver auto-assigned",
    message: "We've assigned Maria Santos to your booking.",
    type: "scheduled_auto_assigned",
    data: {
      bookingId: "64f1a2b3c4d5e6f7a8b9c0ea",
      pickUp: SAMPLE_LOCATIONS.pickUp2,
      dropOff: SAMPLE_LOCATIONS.dropOff1,
      driverId: "64f1a2b3c4d5e6f7a8b9c0d2",
      driverName: "Maria Santos",
      driverRating: 4.9,
      driverProfilePicture: "https://randomuser.me/api/portraits/women/44.jpg",
    },
    isRead: true,
  },
];

/**
 * Seed the notification table with dummy data
 * Call this function from your index file to populate notifications
 */
export async function seedNotifications() {
  try {
    console.log("🌱 Starting notification seed...");

    // // Clear existing notifications for this user (optional - comment out if you don't want to clear)
    // const deleteResult = await NotificationModel.deleteMany({
    //   userId: CLIENT_USER_ID,
    // });
    // console.log(`🗑️  Cleared ${deleteResult.deletedCount} existing notifications`);

    // Insert sample notifications
    const result = await NotificationModel.insertMany(SAMPLE_NOTIFICATIONS);
    console.log(`✅ Successfully seeded ${result.length} notifications`);

    // Display summary
    const unreadCount = result.filter((n) => !n.isRead).length;
    const readCount = result.filter((n) => n.isRead).length;
    console.log(`   - Unread: ${unreadCount}`);
    console.log(`   - Read: ${readCount}`);

    // Display count by type
    const typeCounts: Record<string, number> = {};
    result.forEach((n) => {
      typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
    });
    console.log("📊 Notifications by type:");
    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`   - ${type}: ${count}`);
    });

    return result;
  } catch (error) {
    console.error("❌ Error seeding notifications:", error);
    throw error;
  }
}

/**
 * Strict PH license format:
 * A00-00-000000
 * 1–3 letters + 2 digits + '-' + 2 digits + '-' + 6 digits
 */
function generateDummyLicense(): string {
  // Prefix letters (1–3)
  const lettersLength = Math.floor(Math.random() * 3) + 1;
  let letters = "";
  for (let i = 0; i < lettersLength; i++) {
    letters += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }

  // Two-digit segments
  const yearOrRegion = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0");

  const batch = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0");

  // Six-digit serial (strict)
  const serial = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");

  return `${letters}${yearOrRegion}-${batch}-${serial}`;
}

export async function runDriverLicenseDummyMigration(): Promise<void> {
  console.log(
    "🚧 Replacing all driver license numbers with strict PH-format dummy values...",
  );

  const used = new Set<string>();
  const cursor = DriverModel.find({}).cursor();

  let processed = 0;
  let updated = 0;

  for await (const driver of cursor) {
    processed++;

    let newLicense: string;
    let attempts = 0;

    // Ensure uniqueness (unique index safe)
    do {
      newLicense = generateDummyLicense();
      attempts++;

      if (attempts > 50) {
        throw new Error("Failed generating unique dummy license");
      }
    } while (
      used.has(newLicense) ||
      (await DriverModel.exists({ licenseNumber: newLicense }))
    );

    used.add(newLicense);

    driver.licenseNumber = newLicense;
    await driver.save();
    updated++;
  }

  console.log("✅ Dummy license migration complete.");
  console.log({ processed, updated });
}

// Export for direct use
export default {
  seedNotifications,
  runDriverLicenseDummyMigration,
  CLIENT_USER_ID,
};
