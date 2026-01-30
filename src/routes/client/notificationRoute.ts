// routes/notificationRoute.ts
import {Router} from "express";
import {
  savePushToken,
  enableNotifications,
  disableNotifications,
  getNotificationSettings,
  testPushNotification,
  getNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../../controllers/client/notificationController";

const router = Router();

// Save/update push token
router.post("/token", savePushToken);

// Enable/disable notifications
router.post("/enable", enableNotifications);
router.post("/disable", disableNotifications);

// Get current notification settings
router.get("/settings", getNotificationSettings);

router.get("/", getNotifications);
router.get("/unread", getUnreadCount);
router.patch("/read/:notificationId", markNotificationAsRead);
router.patch("/read-all", markAllNotificationsAsRead);

// Test notification (optional - remove in production or add admin check)
router.post("/test", testPushNotification);

export default router;
