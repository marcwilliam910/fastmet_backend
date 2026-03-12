import { RequestHandler } from "express";
import {
  verifyOTPRegistrationToken,
  verifyReCaptcha,
} from "../utils/helpers/pre-reg-helper";
import { normalizePHPhoneNumber } from "../utils/helpers/otpHelper";
import { PreRegDriverModel } from "../models/PreRegDriver";
import {
  sendConfirmationEmail,
  sendSeminarEmail,
} from "../utils/helpers/email";
import { PreRegUserModel } from "../models/PreRegUser";

export const registerPreRegDriver: RequestHandler = async (req, res) => {
  // ── 1. Extract & validate the OTP-verify token ──────────────────────────
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "OTP verification token is required.",
    });
  }

  let verifiedPhone: string;

  try {
    const raw = authHeader.split(" ")[1];

    ({ phoneNumber: verifiedPhone } = verifyOTPRegistrationToken(raw));
  } catch (err: any) {
    const isExpired = err.name === "TokenExpiredError";
    return res.status(401).json({
      success: false,
      error: isExpired
        ? "OTP session expired. Please verify your number again."
        : "Invalid verification token.",
    });
  }

  // ── 2. Parse & basic-validate body ──────────────────────────────────────
  const {
    firstName,
    lastName,
    contactNumber,
    email,
    vehicleId,
    vehicleVariantId,
  } = req.body;

  const missing = (
    [
      ["firstName", firstName],
      ["lastName", lastName],
      ["contactNumber", contactNumber],
      ["email", email],
      ["vehicleId", vehicleId],
    ] as [string, unknown][]
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    return res.status(400).json({
      success: false,
      error: `Missing required fields: ${missing.join(", ")}`,
    });
  }

  // ── 3. Confirm contactNumber matches the OTP-verified number ────────────
  const normalizedContact = normalizePHPhoneNumber(contactNumber);

  if (!normalizedContact) {
    return res.status(400).json({
      success: false,
      error: "Invalid Philippine mobile number",
    });
  }

  if (normalizedContact !== verifiedPhone) {
    return res.status(403).json({
      success: false,
      error: "Contact number does not match the verified phone number.",
    });
  }

  // ── 5. Persist to DB ─────────────────────────────────────────────────────
  try {
    const driver = await PreRegDriverModel.create({
      phoneNumber: normalizedContact,
      email: email.toLowerCase().trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      vehicle: vehicleId,
      ...(vehicleVariantId ? { vehicleVariant: vehicleVariantId } : {}),
    });

    // // ── 6. Send emails (non-blocking — failures are logged, not thrown) ──
    // const emailResults = await Promise.allSettled([
    //   sendConfirmationEmail({ to: driver.email, firstName: driver.firstName }),
    //   sendSeminarEmail({ to: driver.email, firstName: driver.firstName }),
    // ]);

    // let seminarEmailSent = false;

    // emailResults.forEach((result, idx) => {
    //   const label = idx === 0 ? "Confirmation" : "Seminar";
    //   if (result.status === "fulfilled") {
    //     if (idx === 1) seminarEmailSent = true;
    //     console.log(`[Email] ${label} sent to ${driver.email}`);
    //   } else {
    //     console.error(
    //       `[Email] ${label} failed for ${driver.email}:`,
    //       result.reason,
    //     );
    //   }
    // });

    // // Update seminarEmailSent flag only when the seminar email actually delivered
    // if (seminarEmailSent) {
    //   await PreRegDriverModel.findByIdAndUpdate(driver._id, {
    //     seminarEmailSent: true,
    //   });
    // }

    return res.status(201).json({
      success: true,
      message:
        "Registration submitted. Please check your email for next steps.",
    });
  } catch (error: any) {
    console.error("[Pre-Register Error]", error.message);

    // Mongoose duplicate key (race condition safety net)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "Driver already registered.",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Server error. Please try again.",
    });
  }
};

export const registerPreRegUser: RequestHandler = async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "OTP verification token is required.",
    });
  }

  let verifiedPhone: string;

  try {
    const raw = authHeader.split(" ")[1];

    ({ phoneNumber: verifiedPhone } = verifyOTPRegistrationToken(raw));
  } catch (err: any) {
    const isExpired = err.name === "TokenExpiredError";
    return res.status(401).json({
      success: false,
      error: isExpired
        ? "OTP session expired. Please verify your number again."
        : "Invalid verification token.",
    });
  }

  const { firstName, lastName, contactNumber, gender } = req.body;

  const missing = (
    [
      ["firstName", firstName],
      ["lastName", lastName],
      ["contactNumber", contactNumber],
      ["gender", gender],
    ] as [string, unknown][]
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    return res.status(400).json({
      success: false,
      error: `Missing required fields: ${missing.join(", ")}`,
    });
  }

  const normalizedContact = normalizePHPhoneNumber(contactNumber);

  if (!normalizedContact) {
    return res.status(400).json({
      success: false,
      error: "Invalid Philippine mobile number",
    });
  }

  if (normalizedContact !== verifiedPhone) {
    return res.status(403).json({
      success: false,
      error: "Contact number does not match the verified phone number.",
    });
  }

  try {
    await PreRegUserModel.create({
      phoneNumber: normalizedContact,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      gender,
    });

    return res.status(201).json({
      success: true,
      message:
        "Registration submitted. Please check your email for next steps.",
    });
  } catch (error: any) {
    console.error("[Pre-Register Error]", error.message);

    // Mongoose duplicate key (race condition safety net)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "User already registered.",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Server error. Please try again.",
    });
  }
};

export const getRegistrationCounts: RequestHandler = async (req, res) => {
  try {
    const [drivers, users] = await Promise.all([
      PreRegDriverModel.countDocuments(),
      PreRegUserModel.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      drivers,
      users,
    });
  } catch (error: any) {
    console.error("[Registration Counts Error]", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch registration counts.",
    });
  }
};
