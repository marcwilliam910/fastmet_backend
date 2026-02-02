import {Expo} from "expo-server-sdk";
import UserModel from "../models/User";
import DriverModel from "../models/Driver";

export const expo = new Expo();

export const isValidPushToken = (token: string) => {
  return Expo.isExpoPushToken(token);
};

export const sendNotifToClient = async (
  clientId: string,
  title: string,
  body: string,
  additionalData?: Record<string, any>,
) => {
  const client = await UserModel.findById(clientId);

  if (client?.expoPushToken && client.pushNotificationsEnabled) {
    if (isValidPushToken(client.expoPushToken)) {
      const message = {
        to: client.expoPushToken,
        sound: "default",
        title,
        body,
        data: additionalData,
      };

      try {
        console.log(`📬 Push notification sent to client ${clientId}`);
        return expo.sendPushNotificationsAsync([message]);
      } catch (error) {
        console.error("❌ Failed to send push notification:", error);
      }
    }
  }
};

export const sendNotifToDriver = async (
  driverId: string,
  title: string,
  body: string,
  additionalData?: Record<string, any>,
) => {
  const driver = await DriverModel.findById(driverId);

  if (driver?.expoPushToken && driver.pushNotificationsEnabled) {
    if (isValidPushToken(driver.expoPushToken)) {
      const message = {
        to: driver.expoPushToken,
        sound: "default",
        title,
        body,
        data: additionalData,
      };

      try {
        console.log(`📬 Push notification sent to driver ${driverId}`);
        return expo.sendPushNotificationsAsync([message]);
      } catch (error) {
        console.error("❌ Failed to send push notification:", error);
      }
    }
  }
};
