import { timingSafeEqual } from "crypto";
import redisConnection from "../../config/redis";

const OTP_EXPIRY_SECONDS = 600; // 10 minutes
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 3;
const MAX_VERIFY_ATTEMPTS = 5;

export function normalizePHPhoneNumber(phoneNumber: string): string | null {
  if (typeof phoneNumber !== "string") return null;

  const cleaned = phoneNumber.replace(/\D/g, "");

  if (cleaned.startsWith("639") && cleaned.length === 12) {
    return cleaned;
  } else if (cleaned.startsWith("09") && cleaned.length === 11) {
    return `63${cleaned.substring(1)}`;
  } else if (cleaned.startsWith("9") && cleaned.length === 10) {
    return `63${cleaned}`;
  }

  return null;
}

// Validates that an OTP string is a numeric code of expected length
export function isValidOTPFormat(otp: unknown): otp is string {
  if (typeof otp !== "string") return false;
  return /^\d{4,6}$/.test(otp);
}

// Atomic Redis-based phone number rate limiter (no race condition)
export async function checkPhoneRateLimit(
  phoneNumber: string,
): Promise<boolean> {
  const key = `otp:ratelimit:${phoneNumber}`;

  // Atomic increment + set expiry to avoid race conditions
  const results = await redisConnection
    .multi()
    .incr(key)
    .expire(key, RATE_LIMIT_WINDOW_SECONDS)
    .exec();

  const count = results?.[0]?.[1] as number;
  return count <= RATE_LIMIT_MAX_REQUESTS;
}

// Store OTP in Redis for verification (expires in 10 minutes)
export async function storeOTP(
  phoneNumber: string,
  otp: string,
): Promise<void> {
  const codeKey = `otp:code:${phoneNumber}`;
  const attemptsKey = `otp:verify_attempts:${phoneNumber}`;

  // Store new OTP and reset verification attempts atomically
  await redisConnection
    .multi()
    .setex(codeKey, OTP_EXPIRY_SECONDS, otp)
    .del(attemptsKey)
    .exec();
}

// Verify OTP from Redis with brute-force protection
export async function verifyStoredOTP(
  phoneNumber: string,
  otp: string,
): Promise<{ valid: boolean; locked?: boolean }> {
  const codeKey = `otp:code:${phoneNumber}`;
  const attemptsKey = `otp:verify_attempts:${phoneNumber}`;

  // Check if locked out from too many failed attempts
  const attempts = await redisConnection.get(attemptsKey);
  if (attempts && parseInt(attempts, 10) >= MAX_VERIFY_ATTEMPTS) {
    // Invalidate the OTP entirely — force user to request a new one
    await redisConnection.del(codeKey);
    return { valid: false, locked: true };
  }

  const storedOTP = await redisConnection.get(codeKey);

  if (!storedOTP) {
    return { valid: false };
  }

  // Timing-safe comparison to prevent timing attacks
  const isMatch =
    storedOTP.length === otp.length &&
    timingSafeEqual(Buffer.from(storedOTP), Buffer.from(otp));

  if (isMatch) {
    // Delete OTP and attempts after successful verification
    await redisConnection.multi().del(codeKey).del(attemptsKey).exec();
    return { valid: true };
  }

  // Record failed attempt with same TTL as the OTP
  const newAttempts = await redisConnection.incr(attemptsKey);
  if (newAttempts === 1) {
    await redisConnection.expire(attemptsKey, OTP_EXPIRY_SECONDS);
  }

  // If this was the last allowed attempt, invalidate the OTP
  if (newAttempts >= MAX_VERIFY_ATTEMPTS) {
    await redisConnection.del(codeKey);
    return { valid: false, locked: true };
  }

  return { valid: false };
}
