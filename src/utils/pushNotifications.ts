import { Expo } from "expo-server-sdk";

export const expo = new Expo();

export const isValidPushToken = (token: string) => {
  return Expo.isExpoPushToken(token);
};
