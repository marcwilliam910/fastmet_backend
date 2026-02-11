import { Request, Response } from "express";
import { getUserId } from "../../utils/helpers/getUserId";
import UserModel from "../../models/User";
import NotificationModel from "../../models/Notification";
import { expo, isValidPushToken } from "../../utils/pushNotifications";

export const savePushToken = async (req: Request, res: Response) => {
  const { expoPushToken } = req.body;
  const clientId = getUserId(req);

  if (!clientId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!expoPushToken) {
    return res.status(400).json({ error: "Push token is required" });
  }

  if (!isValidPushToken(expoPushToken)) {
    return res.status(400).json({
      error: "Invalid push token format",
      details: "Token must be in format: ExponentPushToken[...]",
    });
  }

  await UserModel.findByIdAndUpdate(
    clientId,
    {
      expoPushToken,
      pushNotificationsEnabled: true,
      updatedAt: new Date(),
    },
    { new: true },
  );

  console.log(`✅ Saved push token for client ${clientId}`);

  res.json({
    success: true,
    message: "Push token saved successfully",
  });
};

export const enableNotifications = async (req: Request, res: Response) => {
  const clientId = getUserId(req);

  if (!clientId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await UserModel.findByIdAndUpdate(clientId, {
    pushNotificationsEnabled: true,
  });

  res.json({
    success: true,
    message: "Push notifications enabled",
  });
};

export const disableNotifications = async (req: Request, res: Response) => {
  const clientId = getUserId(req);

  if (!clientId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  await UserModel.findByIdAndUpdate(clientId, {
    pushNotificationsEnabled: false,
  });

  res.json({
    success: true,
    message: "Push notifications disabled",
  });
};

export const getNotificationSettings = async (req: Request, res: Response) => {
  const clientId = getUserId(req);

  if (!clientId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const client = await UserModel.findById(clientId).select(
    "expoPushToken pushNotificationsEnabled",
  );

  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  res.json({
    success: true,
    data: {
      hasToken: !!client.expoPushToken,
      enabled: client.pushNotificationsEnabled,
    },
  });
};

export const testPushNotification = async (req: Request, res: Response) => {
  const clientId = getUserId(req);

  if (!clientId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const client = await UserModel.findById(clientId);

  if (!client?.expoPushToken) {
    return res
      .status(400)
      .json({ error: "No push token found for this client" });
  }

  if (!isValidPushToken(client.expoPushToken)) {
    return res.status(400).json({ error: "Invalid push token" });
  }

  const message = {
    to: client.expoPushToken,
    sound: "default",
    title: "🧪 Test Notification",
    body: "This is a test push notification from your logistics app!",
    data: { type: "test" },
  };

  const ticket = await expo.sendPushNotificationsAsync([message]);

  res.json({
    success: true,
    message: "Test notification sent",
    ticket,
  });
};

const getClientNotificationQuery = (clientId: string) => ({
  $or: [
    { userId: clientId, userType: "Client" },
    { isBroadcast: true, userType: { $in: ["Client", "All"] } },
  ],
});

export const getNotifications = async (req: Request, res: Response) => {
  const clientId = getUserId(req);

  if (!clientId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const query = getClientNotificationQuery(clientId);

  const [notifications, totalCount] = await Promise.all([
    NotificationModel.find(query)
      .sort({ updatedAt: -1 })
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
  const clientId = getUserId(req);

  if (!clientId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const query = getClientNotificationQuery(clientId);
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
  const clientId = getUserId(req);
  const { notificationId } = req.params;

  if (!clientId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const notification = await NotificationModel.findOneAndUpdate(
    {
      _id: notificationId,
      $or: [
        { userId: clientId },
        { isBroadcast: true, userType: { $in: ["Client", "All"] } },
      ],
    },
    { isRead: true, readAt: new Date() },
    { new: true },
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
  res: Response,
) => {
  const clientId = getUserId(req);

  if (!clientId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const query = getClientNotificationQuery(clientId);
  const result = await NotificationModel.updateMany(
    { ...query, isRead: false },
    { isRead: true, readAt: new Date() },
  );

  res.json({
    success: true,
    message: "All notifications marked as read",
    data: { modifiedCount: result.modifiedCount },
  });
};

export const getNotificationById = async (req: Request, res: Response) => {
  const notificationId = req.params.notificationId;
  const notification = await NotificationModel.findById(notificationId);
  if (!notification) {
    return res.status(404).json({ error: "Notification not found" });
  }
  res.json(notification);
};
