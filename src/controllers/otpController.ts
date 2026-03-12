import { RequestHandler } from "express";
import axios from "axios";
import {
  normalizePHPhoneNumber,
  checkPhoneRateLimit,
  storeOTP,
  verifyStoredOTP,
} from "../utils/helpers/otpHelper";
import jwt from "jsonwebtoken";
import { verifyReCaptcha } from "../utils/helpers/pre-reg-helper";
import { PreRegDriverModel } from "../models/PreRegDriver";
import { PreRegUserModel } from "../models/PreRegUser";

const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY!;
const SEMAPHORE_OTP_URL = "https://semaphore.co/api/v4/otp";

export const sendOTPWeb: RequestHandler = async (req, res) => {
  const { phoneNumber, captcha, email } = req.body;
  const userType = req.headers["x-user-type"];

  if (!phoneNumber || !captcha) {
    return res.status(400).json({
      success: false,
      error: "Phone number and CAPTCHA are required",
    });
  }

  if (userType !== "driver" && userType !== "client") {
    return res.status(400).json({
      success: false,
      error: "Invalid or missing user type header.",
    });
  }

  const normalized = normalizePHPhoneNumber(phoneNumber);
  if (!normalized) {
    return res.status(400).json({
      success: false,
      error: "Invalid Philippine mobile number",
    });
  }

  // 1. CAPTCHA — block bots before any cost
  try {
    await verifyReCaptcha(captcha, req.ip);
  } catch {
    return res.status(400).json({
      success: false,
      error: "CAPTCHA verification failed. Please try again.",
    });
  }

  // 2. Redis rate limit — secondary defense
  const canSend = await checkPhoneRateLimit(normalized);
  if (!canSend) {
    return res.status(429).json({
      success: false,
      error:
        "Too many OTP requests for this number. Please try again in a minute.",
    });
  }

  // 3. Duplicate check — model depends on userType
  const existing =
    userType === "driver"
      ? await PreRegDriverModel.findOne({
          $or: [
            { phoneNumber: normalized },
            ...(email ? [{ email: email.toLowerCase() }] : []),
          ],
        })
      : await PreRegUserModel.findOne({ phoneNumber: normalized });

  if (existing) {
    return res.status(409).json({
      success: false,
      error:
        existing.phoneNumber === normalized
          ? `A ${userType} with this phone number is already registered.`
          : `A ${userType} with this email is already registered.`,
    });
  }

  try {
    const response = await axios.post(
      SEMAPHORE_OTP_URL,
      new URLSearchParams({
        apikey: SEMAPHORE_API_KEY,
        number: normalized,
        message:
          "Your Fastmet verification code is {otp}. Valid for 10 minutes.",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const otpCode = response.data[0]?.code;
    if (!otpCode) throw new Error("Semaphore did not return an OTP code");

    await storeOTP(normalized, otpCode);

    console.log("[Semaphore OTP] Sent to", normalized);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error: any) {
    console.error("[Semaphore Error]", error.response?.data || error.message);

    const errorMsg =
      typeof error.response?.data === "string"
        ? error.response.data
        : (error.response?.data?.message ?? "");

    if (errorMsg.includes("Invalid number")) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid phone number format" });
    }
    if (errorMsg.includes("Insufficient balance")) {
      return res.status(500).json({
        success: false,
        error: "Service temporarily unavailable. Please try again later.",
      });
    }

    return res
      .status(500)
      .json({ success: false, error: "Failed to send OTP. Please try again." });
  }
};

export const sendOTPMobile: RequestHandler = async (req, res) => {
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

  // Redis-based rate limit (replaces MongoDB otpRateLimiter)
  const canSend = await checkPhoneRateLimit(normalized);

  if (!canSend) {
    return res.status(429).json({
      success: false,
      error:
        "Too many OTP requests for this number. Please try again in a minute.",
    });
  }

  try {
    const response = await axios.post(
      SEMAPHORE_OTP_URL,
      new URLSearchParams({
        apikey: SEMAPHORE_API_KEY,
        number: normalized,
        message:
          "Your Fastmet verification code is {otp}. Valid for 10 minutes.",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const otpCode = response.data[0]?.code;

    if (!otpCode) throw new Error("Semaphore did not return an OTP code");

    // Store OTP in Redis with expiry + attempt tracking
    await storeOTP(normalized, otpCode);

    console.log("[Semaphore OTP] Sent to", normalized);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (error: any) {
    console.error("[Semaphore Error]", error.response?.data || error.message);

    const errorMsg =
      typeof error.response?.data === "string"
        ? error.response.data
        : (error.response?.data?.message ?? "");

    if (errorMsg.includes("Invalid number")) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid phone number format" });
    }

    if (errorMsg.includes("Insufficient balance")) {
      return res.status(500).json({
        success: false,
        error: "Service temporarily unavailable. Please try again later.",
      });
    }

    return res
      .status(500)
      .json({ success: false, error: "Failed to send OTP. Please try again." });
  }
};

export const verifyOTP: RequestHandler = async (req, res) => {
  const { phoneNumber, otpCode: otp } = req.body;

  if (!phoneNumber || !otp) {
    return res.status(400).json({
      success: false,
      error: "Phone number and OTP are required",
    });
  }

  const normalizedNumber = normalizePHPhoneNumber(phoneNumber);

  if (!normalizedNumber) {
    return res.status(400).json({
      success: false,
      error: "Invalid Philippine mobile number",
    });
  }

  try {
    const result = await verifyStoredOTP(normalizedNumber, otp);

    if (!result.success) {
      const messages: Record<string, string> = {
        expired: "OTP has expired. Please request a new one.",
        locked: "Too many failed attempts. Please request a new OTP.",
        invalid: "Invalid OTP. Please try again.",
      };

      return res.status(400).json({
        success: false,
        error: messages[result.reason ?? "invalid"],
      });
    }

    const verifyToken = jwt.sign(
      { phoneNumber: normalizedNumber, purpose: "pre-register" },
      process.env.OTP_JWT_SECRET!,
      { expiresIn: "10m" },
    );

    console.log("[OTP Verify] Success for", normalizedNumber);

    return res.status(200).json({
      success: true,
      verifyToken,
    });
  } catch (error: any) {
    console.error("[OTP Verify Error]", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to verify OTP. Please try again.",
    });
  }
};
