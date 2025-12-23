import { Request, Response } from "express";
import { Expo } from "expo-server-sdk";
import { getUserId } from "../../utils/helpers/getUserId";
import UserModel from "../../models/User";

const expo = new Expo();

export const savePushToken = async (req: Request, res: Response) => {
  try {
    const { expoPushToken } = req.body;
    const clientId = getUserId(req);

    if (!clientId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!expoPushToken) {
      return res.status(400).json({ error: "Push token is required" });
    }

    // Validate token format
    if (!Expo.isExpoPushToken(expoPushToken)) {
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
      { new: true }
    );

    console.log(`✅ Saved push token for client ${clientId}`);

    res.json({
      success: true,
      message: "Push token saved successfully",
    });
  } catch (error) {
    console.error("❌ Error saving push token:", error);
    res.status(500).json({ error: "Failed to save push token" });
  }
};

export const enableNotifications = async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error("❌ Error enabling notifications:", error);
    res.status(500).json({ error: "Failed to enable notifications" });
  }
};

export const disableNotifications = async (req: Request, res: Response) => {
  try {
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
  } catch (error) {
    console.error("❌ Error disabling notifications:", error);
    res.status(500).json({ error: "Failed to disable notifications" });
  }
};

export const getNotificationSettings = async (req: Request, res: Response) => {
  try {
    const clientId = getUserId(req);

    if (!clientId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const client = await UserModel.findById(clientId).select(
      "expoPushToken pushNotificationsEnabled"
    );

    if (!client) {
      return res.status(404).json({ error: "Driver not found" });
    }

    res.json({
      success: true,
      data: {
        hasToken: !!client.expoPushToken,
        enabled: client.pushNotificationsEnabled,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching notification settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
};

export const testPushNotification = async (req: Request, res: Response) => {
  try {
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

    if (!Expo.isExpoPushToken(client.expoPushToken)) {
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
  } catch (error) {
    console.error("❌ Error sending test notification:", error);
    res.status(500).json({ error: "Failed to send test notification" });
  }
};
