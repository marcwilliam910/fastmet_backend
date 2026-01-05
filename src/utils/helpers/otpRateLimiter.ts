import { OTPAttemptModel } from "../../models/OTPAttempt";

const RATE_LIMITS = {
  MAX_ATTEMPTS: 3, // Max 3 OTP sends
  TIME_WINDOW: 15 * 60 * 1000, // within 15 minutes
  BLOCK_DURATION: 60 * 60 * 1000, // Block for 1 hour after exceeding

  // Verification limits
  MAX_VERIFY_ATTEMPTS: 5, // Max 5 wrong OTP attempts
  VERIFY_BLOCK_DURATION: 30 * 60 * 1000, // Block for 30 minutes
};

interface RateLimitResult {
  allowed: boolean;
  message?: string;
  retryAfter?: number; // seconds
}

export async function checkOTPRateLimit(
  phoneNumber: string
): Promise<RateLimitResult> {
  const now = new Date();

  let attempt = await OTPAttemptModel.findOne({ phoneNumber });

  if (!attempt) {
    return { allowed: true };
  }

  if (attempt.blockedUntil && attempt.blockedUntil > now) {
    const retryAfter = Math.ceil(
      (attempt.blockedUntil.getTime() - now.getTime()) / 1000
    );
    const minutes = Math.ceil(retryAfter / 60);

    return {
      allowed: false,
      message: `Too many attempts. Please try again in ${minutes} minute${
        minutes > 1 ? "s" : ""
      }.`,
      retryAfter,
    };
  }

  const timeSinceLastAttempt =
    now.getTime() - attempt.lastSendAttempt.getTime();

  if (timeSinceLastAttempt > RATE_LIMITS.TIME_WINDOW) {
    attempt.sendAttempts = 0;
    await attempt.save();
    return { allowed: true };
  }

  if (attempt.sendAttempts >= RATE_LIMITS.MAX_ATTEMPTS) {
    attempt.blockedUntil = new Date(now.getTime() + RATE_LIMITS.BLOCK_DURATION);
    await attempt.save();

    return {
      allowed: false,
      message: "Too many OTP requests. Please try again in 1 hour.",
      retryAfter: RATE_LIMITS.BLOCK_DURATION / 1000,
    };
  }

  return { allowed: true };
}

export async function recordOTPAttempt(phoneNumber: string): Promise<void> {
  await OTPAttemptModel.findOneAndUpdate(
    { phoneNumber },
    {
      $inc: { sendAttempts: 1 },
      $set: {
        lastSendAttempt: new Date(),
        verifyAttempts: 0,
      },
      $unset: {
        verifyBlockedUntil: "", // Use $unset to actually remove the field
      },
    },
    { upsert: true, new: true }
  );
}

// ============ VERIFICATION RATE LIMITING ============

export async function checkVerifyRateLimit(
  phoneNumber: string
): Promise<RateLimitResult> {
  const now = new Date();

  let attempt = await OTPAttemptModel.findOne({ phoneNumber });

  if (!attempt) {
    return { allowed: true };
  }

  // Check if currently blocked from verification
  if (attempt.verifyBlockedUntil && attempt.verifyBlockedUntil > now) {
    const retryAfter = Math.ceil(
      (attempt.verifyBlockedUntil.getTime() - now.getTime()) / 1000
    );
    const minutes = Math.ceil(retryAfter / 60);

    return {
      allowed: false,
      message: `Too many failed attempts. Please try again in ${minutes} minute${
        minutes > 1 ? "s" : ""
      }.`,
      retryAfter,
    };
  }

  // Check if limit exceeded
  if (attempt.verifyAttempts >= RATE_LIMITS.MAX_VERIFY_ATTEMPTS) {
    // Block verification
    attempt.verifyBlockedUntil = new Date(
      now.getTime() + RATE_LIMITS.VERIFY_BLOCK_DURATION
    );
    await attempt.save();

    return {
      allowed: false,
      message: "Too many failed attempts. Please try again in 30 minutes.",
      retryAfter: RATE_LIMITS.VERIFY_BLOCK_DURATION / 1000,
    };
  }

  return { allowed: true };
}

export async function recordFailedVerification(
  phoneNumber: string
): Promise<void> {
  await OTPAttemptModel.findOneAndUpdate(
    { phoneNumber },
    {
      $inc: { verifyAttempts: 1 },
      $set: { lastVerifyAttempt: new Date() },
    },
    { upsert: true, new: true }
  );
}

export async function clearVerificationAttempts(
  phoneNumber: string
): Promise<void> {
  // Clear verification attempts on successful verification
  await OTPAttemptModel.findOneAndUpdate(
    { phoneNumber },
    {
      $set: {
        verifyAttempts: 0,
      },
      $unset: {
        verifyBlockedUntil: "",
      },
    }
  );
}
