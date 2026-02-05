import { Request, Response } from "express";
import { Expo } from "expo-server-sdk";
import DriverModel from "../../models/Driver";
import NotificationModel from "../../models/Notification";
import { getUserId } from "../../utils/helpers/getUserId";

const expo = new Expo();

export const savePushToken = async (req: Request, res: Response) => {
  const { expoPushToken } = req.body;
  const driverId = getUserId(req);

  if (!driverId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!expoPushToken) {
    return res.status(400).json({ error: "Push token is required" });
  }

  if (!Expo.isExpoPushToken(expoPushToken)) {
    return res.status(400).json({
      error: "Invalid push token format",
      details: "Token must be in format: ExponentPushToken[...]",
    });
  }

  await DriverModel.findByIdAndUpdate(
    driverId,
    {
      expoPushToken,
      pushNotificationsEnabled: true,
      updatedAt: new Date(),
    },
    { new: true }
  );

  console.log(`✅ Saved push token for driver ${driverId}`);

  res.json({
    success: true,
    message: "Push token saved successfully",
  });
};

export const enableNotifications = async (req: Request, res: Response) => {
  const driverId = getUserId(req);

  if (!driverId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await DriverModel.findByIdAndUpdate(driverId, {
    pushNotificationsEnabled: true,
  });

  res.json({
    success: true,
    message: "Push notifications enabled",
  });
};

export const disableNotifications = async (req: Request, res: Response) => {
  const driverId = getUserId(req);

  if (!driverId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await DriverModel.findByIdAndUpdate(driverId, {
    pushNotificationsEnabled: false,
  });

  res.json({
    success: true,
    message: "Push notifications disabled",
  });
};

export const getNotificationSettings = async (req: Request, res: Response) => {
  const driverId = getUserId(req);

  if (!driverId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const driver = await DriverModel.findById(driverId).select(
    "expoPushToken pushNotificationsEnabled"
  );

  if (!driver) {
    return res.status(404).json({ error: "Driver not found" });
  }

  res.json({
    success: true,
    data: {
      hasToken: !!driver.expoPushToken,
      enabled: driver.pushNotificationsEnabled,
    },
  });
};

export const testPushNotification = async (req: Request, res: Response) => {
  const driverId = req.query.driverId;

  if (!driverId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const driver = await DriverModel.findById(driverId);

  if (!driver?.expoPushToken) {
    return res
      .status(400)
      .json({ error: "No push token found for this driver" });
  }

  if (!Expo.isExpoPushToken(driver.expoPushToken)) {
    return res.status(400).json({ error: "Invalid push token" });
  }

  const message = {
    to: driver.expoPushToken,
    sound: "default",
    title: "Hi Boss",
    body: "baka pwede makautang bossing kahit 1500 lang",
    data: { type: "test" },
  };

  const ticket = await expo.sendPushNotificationsAsync([message]);

  res.json({
    success: true,
    message: "Test notification sent",
    ticket,
  });
};

const getDriverNotificationQuery = (driverId: string) => ({
  $or: [
    { userId: driverId, userType: "Driver" },
    { isBroadcast: true, userType: { $in: ["Driver", "All"] } },
  ],
});

export const getNotifications = async (req: Request, res: Response) => {
  const driverId = getUserId(req);

  if (!driverId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const query = getDriverNotificationQuery(driverId);

  const [notifications, totalCount] = await Promise.all([
    NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    NotificationModel.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  res.json({
    success: true,
    data: {
      notifications,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    },
  });
};

export const getUnreadCount = async (req: Request, res: Response) => {
  const driverId = getUserId(req);

  if (!driverId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const query = getDriverNotificationQuery(driverId);
  const unreadCount = await NotificationModel.countDocuments({
    ...query,
    isRead: false,
  });

  res.json({
    success: true,
    data: { unreadCount },
  });
};

export const markNotificationAsRead = async (req: Request, res: Response) => {
  const driverId = getUserId(req);
  const { notificationId } = req.params;

  if (!driverId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const notification = await NotificationModel.findOneAndUpdate(
    {
      _id: notificationId,
      $or: [
        { userId: driverId },
        { isBroadcast: true, userType: { $in: ["Driver", "All"] } },
      ],
    },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) {
    return res.status(404).json({ error: "Notification not found" });
  }

  res.json({
    success: true,
    message: "Notification marked as read",
    data: notification,
  });
};

export const markAllNotificationsAsRead = async (
  req: Request,
  res: Response
) => {
  const driverId = getUserId(req);

  if (!driverId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const query = getDriverNotificationQuery(driverId);
  const result = await NotificationModel.updateMany(
    { ...query, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  res.json({
    success: true,
    message: "All notifications marked as read",
    data: { modifiedCount: result.modifiedCount },
  });
};
