import { RequestHandler } from "express";
import { generateJWT } from "../../utils/helpers/jwt";
import UserModel from "../../models/User";
import { normalizePHPhoneNumber } from "../../utils/helpers/phoneNumber";
import {
  checkOTPRateLimit,
  checkVerifyRateLimit,
  clearVerificationAttempts,
  recordFailedVerification,
  recordOTPAttempt,
} from "../../utils/helpers/otpRateLimiter";

export const sendOTP: RequestHandler = async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({
      error: "Phone number is required",
    });
  }

  const normalized = normalizePHPhoneNumber(phoneNumber);

  if (!normalized) {
    return res.status(400).json({
      error: "Invalid Philippine mobile number",
    });
  }

  // Check rate limit
  const rateLimitCheck = await checkOTPRateLimit(normalized);

  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      error: rateLimitCheck.message,
      retryAfter: rateLimitCheck.retryAfter,
    });
  }

  // TODO: Send actual OTP via Twilio (add later)

  // Record this attempt AFTER successful send
  await recordOTPAttempt(normalized);

  res.status(200).json({
    success: true,
  });
};

export const verifyOTP: RequestHandler = async (req, res) => {
  const { phoneNumber, otpCode: otp } = req.body;

  if (!phoneNumber.trim() || !otp.trim()) {
    return res.status(400).json({
      error: "Phone number and OTP are required",
      success: false,
    });
  }

  const normalizedNumber = normalizePHPhoneNumber(phoneNumber);

  if (!normalizedNumber) {
    return res.status(400).json({
      error: "Invalid Philippine mobile number",
      success: false,
    });
  }

  // Check verification rate limit
  const rateLimitCheck = await checkVerifyRateLimit(normalizedNumber);

  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      error: rateLimitCheck.message,
      retryAfter: rateLimitCheck.retryAfter,
      success: false,
    });
  }

  const DUMMY_OTP = "123456";

  if (otp !== DUMMY_OTP) {
    // Record failed attempt
    await recordFailedVerification(normalizedNumber);

    return res.status(400).json({
      error: "Invalid OTP, please try again",
      success: false,
    });
  }

  // Clear verification attempts on success
  await clearVerificationAttempts(normalizedNumber);

  let user = await UserModel.findOne({ phoneNumber: normalizedNumber });
  let status: "existing" | "new";

  if (!user) {
    user = await UserModel.create({
      phoneNumber: normalizedNumber,
    });
    status = "new";
  } else {
    status = "existing";
  }

  const token = generateJWT({
    id: user._id,
    phoneNumber: user.phoneNumber,
    userType: "client",
  });

  return res.status(200).json({
    success: true,
    token,
    status,
    client: {
      id: user._id,
      isProfileComplete: user.isProfileComplete,
      fullName: user.fullName,
      profilePictureUrl: user.profilePictureUrl,
      phoneNumber: user.phoneNumber,
      address:
        user.address &&
        typeof user.address === "object" &&
        "coords" in (user.address as any) &&
        (user.address as any).coords &&
        typeof (user.address as any).coords.lat === "number" &&
        typeof (user.address as any).coords.lng === "number"
          ? user.address
          : null,
      gender: user.gender,
    },
  });
};
