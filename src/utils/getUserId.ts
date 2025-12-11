import { Request } from "express";

export const getUserId = (req: Request): string => {
  if (!req.user?.id) throw new Error("User ID not found");
  return req.user.id;
};
