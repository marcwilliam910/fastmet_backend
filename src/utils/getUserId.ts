import { Request } from "express";

export const getUserId = (req: Request): string => {
  if (!req.user) throw new Error("User not authenticated");

  if (req.user.userType === "driver" && req.user.driverId)
    return req.user.driverId;
  if (req.user.userType === "client" && req.user.clientId)
    return req.user.clientId;

  throw new Error("User ID not found");
};
