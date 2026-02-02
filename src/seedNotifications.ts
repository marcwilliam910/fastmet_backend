import mongoose from "mongoose";
import NotificationModel from "./models/Notification";

// Replace these with actual user IDs from your database
const SAMPLE_CLIENT_ID = "6930f5e570b542f552dbec7e";
const SAMPLE_DRIVER_ID = "692f980a631c3a94797f300d";

const notificationTypes = {
  BOOKING_CONFIRMED: "booking_confirmed",
  BOOKING_CANCELLED: "booking_cancelled",
  DRIVER_ASSIGNED: "driver_assigned",
  DRIVER_ARRIVED: "driver_arrived",
  DELIVERY_COMPLETE: "delivery_complete",
  PAYMENT_RECEIVED: "payment_received",
  NEW_BOOKING: "new_booking",
  PROMO: "promo",
  SYSTEM: "system",
  REMINDER: "reminder",
};

const clientNotifications = [
  {
    userId: new mongoose.Types.ObjectId(SAMPLE_CLIENT_ID),
    userType: "Client",
    isBroadcast: false,
    title: "Booking Confirmed",
    message:
      "Your booking #12345 has been confirmed. A driver will be assigned shortly.",
    type: notificationTypes.BOOKING_CONFIRMED,
    isRead: false,
    data: {bookingId: "booking_12345"},
  },
  {
    userId: new mongoose.Types.ObjectId(SAMPLE_CLIENT_ID),
    userType: "Client",
    isBroadcast: false,
    title: "Driver Assigned",
    message:
      "Juan Dela Cruz has been assigned to your booking. They will arrive in approximately 15 minutes.",
    type: notificationTypes.DRIVER_ASSIGNED,
    isRead: false,
    data: {bookingId: "booking_12345", driverName: "Juan Dela Cruz"},
  },
  {
    userId: new mongoose.Types.ObjectId(SAMPLE_CLIENT_ID),
    userType: "Client",
    isBroadcast: false,
    title: "Driver Has Arrived",
    message: "Your driver has arrived at the pickup location.",
    type: notificationTypes.DRIVER_ARRIVED,
    isRead: true,
    readAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    data: {bookingId: "booking_12345"},
  },
  {
    userId: new mongoose.Types.ObjectId(SAMPLE_CLIENT_ID),
    userType: "Client",
    isBroadcast: false,
    title: "Delivery Complete",
    message:
      "Your delivery has been completed successfully. Thank you for using our service!",
    type: notificationTypes.DELIVERY_COMPLETE,
    isRead: true,
    readAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    data: {bookingId: "booking_12345"},
  },
  {
    userId: new mongoose.Types.ObjectId(SAMPLE_CLIENT_ID),
    userType: "Client",
    isBroadcast: false,
    title: "Booking Cancelled",
    message: "Your booking #12346 has been cancelled as requested.",
    type: notificationTypes.BOOKING_CANCELLED,
    isRead: false,
    data: {bookingId: "booking_12346"},
  },
];

const driverNotifications = [
  {
    userId: new mongoose.Types.ObjectId(SAMPLE_DRIVER_ID),
    userType: "Driver",
    isBroadcast: false,
    title: "New Booking Request",
    message:
      "You have a new booking request from Makati to Quezon City. Tap to view details.",
    type: notificationTypes.NEW_BOOKING,
    isRead: false,
    data: {
      bookingId: "booking_12347",
      pickup: "Makati",
      dropoff: "Quezon City",
    },
  },
  {
    userId: new mongoose.Types.ObjectId(SAMPLE_DRIVER_ID),
    userType: "Driver",
    isBroadcast: false,
    title: "Payment Received",
    message:
      "You received ₱350.00 for booking #12340. Check your wallet for details.",
    type: notificationTypes.PAYMENT_RECEIVED,
    isRead: false,
    data: {bookingId: "booking_12340", amount: 350},
  },
  {
    userId: new mongoose.Types.ObjectId(SAMPLE_DRIVER_ID),
    userType: "Driver",
    isBroadcast: false,
    title: "Booking Cancelled by Client",
    message: "Booking #12348 has been cancelled by the client.",
    type: notificationTypes.BOOKING_CANCELLED,
    isRead: true,
    readAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
    data: {bookingId: "booking_12348"},
  },
  {
    userId: new mongoose.Types.ObjectId(SAMPLE_DRIVER_ID),
    userType: "Driver",
    isBroadcast: false,
    title: "Daily Reminder",
    message: "Don't forget to go online to start receiving booking requests!",
    type: notificationTypes.REMINDER,
    isRead: true,
    readAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
    data: {},
  },
];

const broadcastNotifications = [
  {
    userId: null,
    userType: "All",
    isBroadcast: true,
    title: "🎉 New Feature Available",
    message:
      "We've added real-time tracking! You can now see your delivery status live on the map.",
    type: notificationTypes.SYSTEM,
    isRead: false,
    data: {feature: "real_time_tracking"},
  },
  {
    userId: null,
    userType: "All",
    isBroadcast: true,
    title: "Scheduled Maintenance",
    message:
      "The app will undergo maintenance on Sunday 2AM-4AM. Service may be temporarily unavailable.",
    type: notificationTypes.SYSTEM,
    isRead: false,
    data: {maintenanceDate: "2026-02-01T02:00:00Z"},
  },
  {
    userId: null,
    userType: "Client",
    isBroadcast: true,
    title: "🚚 50% Off Your Next Booking!",
    message:
      "Use code FASTMET50 to get 50% off your next delivery. Valid until Feb 15.",
    type: notificationTypes.PROMO,
    isRead: false,
    data: {promoCode: "FASTMET50", validUntil: "2026-02-15"},
  },
  {
    userId: null,
    userType: "Driver",
    isBroadcast: true,
    title: "💰 Bonus Weekend!",
    message:
      "Complete 10 deliveries this weekend and earn an extra ₱500 bonus!",
    type: notificationTypes.PROMO,
    isRead: false,
    data: {bonusAmount: 500, requiredDeliveries: 10},
  },
];

export async function seedNotifications() {
  // Clear existing notifications (optional - comment out if you want to keep existing)
  await NotificationModel.deleteMany({});
  console.log("🗑️  Cleared existing notifications");

  // Insert all notifications
  const allNotifications = [
    ...clientNotifications,
    ...driverNotifications,
    ...broadcastNotifications,
  ];

  const result = await NotificationModel.insertMany(allNotifications);
  console.log(`✅ Inserted ${result.length} notifications`);

  console.log("\n📊 Summary:");
  console.log(`   - Client notifications: ${clientNotifications.length}`);
  console.log(`   - Driver notifications: ${driverNotifications.length}`);
  console.log(`   - Broadcast notifications: ${broadcastNotifications.length}`);
}

// Run: seedNotifications();
