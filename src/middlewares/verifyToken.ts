import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export const authenticateJWT = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET!;
    const decoded = jwt.verify(token, secret) as {
      driverId?: string;
      clientId?: string;
      phoneNumber: string;
      userType: "driver" | "client";
    };

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
