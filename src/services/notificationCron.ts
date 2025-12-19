import cron from "node-cron";
import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import BookingModel from "../models/Booking";

const expo = new Expo();
const NOTIFICATION_WINDOW_MINUTES = 15;

export const startNotificationCron = () => {
  // Option: Only run during your peak hours (e.g., 5 AM - 11 PM)
  // cron.schedule('*/2 5-23 * * *', async () => {
  cron.schedule("*/2 * * * *", async () => {
    try {
      const now = new Date();
      const notificationTime = new Date(
        now.getTime() + NOTIFICATION_WINDOW_MINUTES * 60 * 1000
      );

      // Find bookings that need notifications
      const bookingsToNotify = await BookingModel.find({
        status: "scheduled",
        "bookingType.type": "schedule",
        "bookingType.value": {
          $lte: notificationTime,
          $gt: now,
        },
        notificationSent: { $ne: true },
        driver: { $ne: null }, // Make sure driver is assigned
      })
        .populate("driver.id", "expoPushToken pushNotificationsEnabled")
        .lean();

      if (bookingsToNotify.length === 0) {
        return;
      }

      console.log(`📋 Found ${bookingsToNotify.length} bookings to notify`);

      const messages: ExpoPushMessage[] = [];
      const bookingIdsToUpdate: string[] = [];

      for (const booking of bookingsToNotify) {
        // Access driver through nested structure
        const driver = booking.driver?.id as any;

        if (!driver) {
          console.log(`⚠️ Booking ${booking._id} has no driver assigned`);
          continue;
        }

        // Skip if driver disabled notifications
        if (!driver.pushNotificationsEnabled) {
          console.log(`⏭️ Driver ${driver._id} has notifications disabled`);
          continue;
        }

        // Skip if no valid push token
        if (!driver.expoPushToken) {
          console.log(`⚠️ Driver ${driver._id} has no push token`);
          continue;
        }

        // Validate token format
        if (!Expo.isExpoPushToken(driver.expoPushToken)) {
          console.log(`⚠️ Invalid push token for driver ${driver._id}`);
          continue;
        }

        const scheduledTime = new Date(booking.bookingType.value);
        const minutesUntil = Math.round(
          (scheduledTime.getTime() - now.getTime()) / 60000
        );

        // Create push message
        messages.push({
          to: driver.expoPushToken,
          sound: "default",
          title: "🚗 Scheduled Trip Starting Soon",
          body: `Your trip to ${booking.dropOff.address} starts in ${minutesUntil} minutes`,
          data: {
            bookingId: booking._id.toString(),
            bookingRef: booking.bookingRef,
            type: "scheduled_reminder",
            screen: "Schedule",
            pickupAddress: booking.pickUp.address,
            dropoffAddress: booking.dropOff.address,
            scheduledTime: booking.bookingType.value,
          },
          priority: "high",
          badge: 1,
          channelId: "default",
        });

        bookingIdsToUpdate.push(booking._id.toString());
      }

      if (messages.length === 0) {
        console.log("📭 No valid messages to send");
        return;
      }

      // Send notifications in chunks
      const chunks = expo.chunkPushNotifications(messages);
      const tickets: ExpoPushTicket[] = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
          console.log(`📤 Sent chunk of ${chunk.length} notifications`);
        } catch (error) {
          console.error("❌ Error sending notification chunk:", error);
        }
      }

      // Mark bookings as notified
      await BookingModel.updateMany(
        { _id: { $in: bookingIdsToUpdate } },
        {
          $set: {
            notificationSent: true,
            notifiedAt: new Date(),
          },
        }
      );

      console.log(
        `✅ Sent ${messages.length} notifications and marked as notified`
      );

      // Check for errors in tickets
      tickets.forEach((ticket, index) => {
        if (ticket.status === "error") {
          console.error(`❌ Notification ${index} failed:`, ticket.message);
          if (ticket.details?.error) {
            console.error("Details:", ticket.details.error);
          }
        }
      });
    } catch (error) {
      console.error("❌ Error in notification cron:", error);
    }
  });

  console.log("🔔 Notification cron job started (runs every 2 minutes, 24/7)");
};

// const TEST_EXPO_PUSH_TOKEN = "ExponentPushToken[PnLZV3F5G4R_51x6M94f8R]";

// export const startTestNotificationCron = () => {
//   cron.schedule("*/2 * * * *", async () => {
//     try {
//       console.log("🧪 Running TEST notification cron");

//       // Validate token format
//       if (!Expo.isExpoPushToken(TEST_EXPO_PUSH_TOKEN)) {
//         console.error("❌ Invalid Expo push token");
//         return;
//       }

//       const message: ExpoPushMessage = {
//         to: TEST_EXPO_PUSH_TOKEN,
//         sound: "default",
//         title: "🧪 Test Scheduled Notification",
//         body: "This is a hardcoded test notification from cron",
//         data: {
//           type: "test_cron",
//           screen: "Schedule",
//           timestamp: new Date().toISOString(),
//         },
//         priority: "high",
//         badge: 1,
//         channelId: "default",
//       };

//       const chunks = expo.chunkPushNotifications([message]);
//       const tickets: ExpoPushTicket[] = [];

//       for (const chunk of chunks) {
//         try {
//           const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
//           tickets.push(...ticketChunk);
//           console.log("📤 Test notification sent");
//         } catch (err) {
//           console.error("❌ Error sending test notification:", err);
//         }
//       }

//       tickets.forEach((ticket) => {
//         if (ticket.status === "error") {
//           console.error("❌ Push ticket error:", ticket.message);
//           if (ticket.details?.error) {
//             console.error("Details:", ticket.details.error);
//           }
//         }
//       });
//     } catch (error) {
//       console.error("❌ Error in TEST notification cron:", error);
//     }
//   });

//   console.log("🧪 Test notification cron started (every 2 minutes)");
// };
