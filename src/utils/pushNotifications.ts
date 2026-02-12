import { Expo, ExpoPushMessage } from "expo-server-sdk";
import UserModel from "../models/User";
import DriverModel from "../models/Driver";
import { notificationQueue } from "../queues";

export const expo = new Expo();

export type NotificationUserType = "Client" | "Driver";

export interface NotificationJobData {
  userType: NotificationUserType;
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  type?: string;
}

export const isValidPushToken = (token: string) => Expo.isExpoPushToken(token);

const enqueueNotification = async (payload: NotificationJobData) => {
  const jobId = `notif-${payload.userType}-${payload.userId}-${Date.now()}`;
  const job = await notificationQueue.add("send", payload, { jobId, delay: 0 });
  return { jobId: job.id };
};

export const processNotificationJob = async (payload: NotificationJobData) => {
  const { userType, userId, title, body, data } = payload;
  const user =
    userType === "Client"
      ? await UserModel.findById(userId).select(
          "expoPushToken pushNotificationsEnabled",
        )
      : await DriverModel.findById(userId).select(
          "expoPushToken pushNotificationsEnabled",
        );

  if (!user?.expoPushToken || !user.pushNotificationsEnabled) {
    return;
  }

  if (!isValidPushToken(user.expoPushToken)) {
    console.warn(`Invalid push token for ${userType.toLowerCase()} ${userId}`);
    return;
  }

  const message: ExpoPushMessage = {
    to: user.expoPushToken,
    sound: "default",
    title,
    body,
    data,
    priority: "high",
    badge: 1,
    channelId: "default",
  };

  const tickets = await expo.sendPushNotificationsAsync([message]);

  for (const ticket of tickets) {
    if (ticket.status === "error") {
      console.error("Push ticket error:", ticket.message);

      if (ticket.details?.error === "DeviceNotRegistered") {
        if (userType === "Client") {
          await UserModel.findByIdAndUpdate(userId, { expoPushToken: null });
        } else {
          await DriverModel.findByIdAndUpdate(userId, { expoPushToken: null });
        }
      }
    }
  }
};

export const sendNotifToClient = async (
  clientId: string,
  title: string,
  body: string,
  additionalData?: Record<string, any>,
) =>
  enqueueNotification({
    userType: "Client",
    userId: clientId,
    title,
    body,
    data: additionalData,
    type: additionalData?.type,
  });

export const sendNotifToDriver = async (
  driverId: string,
  title: string,
  body: string,
  additionalData?: Record<string, any>,
) =>
  enqueueNotification({
    userType: "Driver",
    userId: driverId,
    title,
    body,
    data: additionalData,
    type: additionalData?.type,
  });
