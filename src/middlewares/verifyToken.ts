import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { verifyOTPRegistrationToken } from "../utils/helpers/pre-reg-helper";

export const authenticateJWT = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET!;
    const decoded = jwt.verify(token, secret) as {
      id: string;
      phoneNumber: string;
      userType: "driver" | "client";
    };

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// Middleware to check if the user has verified their phone number via otp
export const requireVerifyToken: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "OTP verification token is required.",
    });
  }

  try {
    const token = authHeader.split(" ")[1];
    const { phoneNumber } = verifyOTPRegistrationToken(token);

    req.verifiedPhone = phoneNumber;
    next();
  } catch (err: any) {
    const isExpired = err.name === "TokenExpiredError";
    return res.status(401).json({
      success: false,
      error: isExpired
        ? "OTP session expired. Please verify your number again."
        : "Invalid verification token.",
    });
  }
};
