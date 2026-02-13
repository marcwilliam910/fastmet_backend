// import { Worker, Job } from "bullmq";
// import { Expo, ExpoPushMessage } from "expo-server-sdk";
// import redisConnection from "../config/redis";
// import BookingModel from "../models/Booking";
// import { IDriver } from "../models/Driver";

// const expo = new Expo();

// interface ScheduledReminderJobData {
//   bookingId: string;
//   driverId: string;
// }

// export const startScheduledReminderWorker = () => {
//   const worker = new Worker<ScheduledReminderJobData>(
//     "scheduledReminder",
//     async (job: Job<ScheduledReminderJobData>) => {
//       const { bookingId, driverId } = job.data;

//       console.log(
//         `🔔 Processing reminder job for booking ${bookingId}, driver ${driverId}`,
//       );

//       // Check if booking still exists and is still "scheduled"
//       const booking = await BookingModel.findById(bookingId)
//         .populate<{
//           driverId: Partial<IDriver>;
//         }>("driverId", "expoPushToken pushNotificationsEnabled")
//         .lean();

//       if (!booking) {
//         console.log(`Booking ${bookingId} no longer exists, skipping`);
//         return;
//       }

//       if (booking.status !== "scheduled") {
//         console.log(
//           `Booking ${bookingId} status is "${booking.status}", not "scheduled", skipping`,
//         );
//         return;
//       }

//       // Already notified check
//       if (booking.notificationSent) {
//         console.log(`Booking ${bookingId} already notified, skipping`);
//         return;
//       }

//       const driver = booking.driverId;

//       if (!driver) {
//         console.log(`Booking ${bookingId} has no driver assigned, skipping`);
//         return;
//       }

//       // Skip if driver disabled notifications
//       if (!driver.pushNotificationsEnabled) {
//         console.log(`Driver ${driver._id} has notifications disabled`);
//         return;
//       }

//       // Skip if no valid push token
//       if (!driver.expoPushToken) {
//         console.log(`Driver ${driver._id} has no push token`);
//         return;
//       }

//       // Validate token format
//       if (!Expo.isExpoPushToken(driver.expoPushToken)) {
//         console.log(`Invalid push token for driver ${driver._id}`);
//         return;
//       }

//       const scheduledTime = new Date(booking.bookingType.value);
//       const now = new Date();
//       const minutesUntil = Math.round(
//         (scheduledTime.getTime() - now.getTime()) / 60000,
//       );

//       // Create push message
//       const message: ExpoPushMessage = {
//         to: driver.expoPushToken,
//         sound: "default",
//         title: "🚗 Scheduled Trip Starting Soon",
//         body: `Your trip to ${booking.dropOff.name} starts in about ${minutesUntil} minutes`,
//         data: {
//           bookingId: booking._id.toString(),
//           bookingRef: booking.bookingRef,
//           type: "scheduled_reminder",
//           screen: "Schedule",
//           pickupAddress: booking.pickUp.address,
//           dropoffAddress: booking.dropOff.address,
//           scheduledTime: booking.bookingType.value,
//         },
//         priority: "high",
//         badge: 1,
//         channelId: "default",
//       };

//       // Send notification
//       try {
//         const chunks = expo.chunkPushNotifications([message]);
//         for (const chunk of chunks) {
//           const ticketChunk = await expo.sendPushNotificationsAsync(chunk);

//           ticketChunk.forEach((ticket) => {
//             if (ticket.status === "error") {
//               console.error(`Push notification error:`, ticket.message);
//             }
//           });
//         }

//         // Mark booking as notified
//         await BookingModel.updateOne(
//           { _id: bookingId },
//           {
//             $set: {
//               notificationSent: true,
//               notifiedAt: new Date(),
//             },
//           },
//         );

//         console.log(`📤 Sent reminder notification for booking ${bookingId}`);
//       } catch (error) {
//         console.error(`Failed to send notification:`, error);
//         throw error; // Rethrow to trigger retry
//       }
//     },
//     {
//       connection: redisConnection,
//       concurrency: 10, // Can process more since it's just sending notifications
//     },
//   );

//   worker.on("completed", (job) => {
//     console.log(`✅ Reminder job ${job.id} completed`);
//   });

//   worker.on("failed", (job, err) => {
//     console.error(`❌ Reminder job ${job?.id} failed:`, err);
//   });

//   console.log("🔔 Scheduled reminder worker started");

//   return worker;
// };
