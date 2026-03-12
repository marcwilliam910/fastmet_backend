import redisConnection from "../../config/redis";

export function normalizePHPhoneNumber(phoneNumber: string): string | null {
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

const MAX_OTP_REQUESTS_PER_MINUTE = 3;
const MAX_VERIFY_ATTEMPTS = 5;

const RATE_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local limit = tonumber(ARGV[1])
  local ttl = tonumber(ARGV[2])

  local count = redis.call('INCR', key)

  -- Only set TTL on the FIRST increment — prevents resetting window on each request
  if count == 1 then
    redis.call('EXPIRE', key, ttl)
  end

  return count
`;
/**
 * Rate limits OTP send requests — max 3 per phone per minute.
 * Uses a Lua script to atomically INCR + conditionally set TTL,
 * preventing orphaned keys and avoiding TTL reset on every request.
 */
export async function checkPhoneRateLimit(
  phoneNumber: string,
): Promise<boolean> {
  const key = `otp:ratelimit:${phoneNumber}`;

  const count = (await redisConnection.eval(
    RATE_LIMIT_SCRIPT,
    1, // number of KEYS
    key, // KEYS[1]
    String(MAX_OTP_REQUESTS_PER_MINUTE), // ARGV[1]
    "60", // ARGV[2] — TTL in seconds
  )) as number;

  return count <= MAX_OTP_REQUESTS_PER_MINUTE;
}

/**
 * Stores OTP in Redis with a 10-minute expiry.
 * Also resets the verify-attempt counter for this phone number.
 */
export async function storeOTP(
  phoneNumber: string,
  otp: string,
): Promise<void> {
  const otpKey = `otp:code:${phoneNumber}`;
  const attemptsKey = `otp:attempts:${phoneNumber}`;

  // Use pipeline to batch both writes atomically
  await redisConnection
    .pipeline()
    .setex(otpKey, 600, otp) // OTP expires in 10 minutes
    .del(attemptsKey) // Reset attempt counter on new OTP
    .exec();
}

/**
 * Verifies a submitted OTP against the stored one.
 * Tracks failed attempts and locks out after MAX_VERIFY_ATTEMPTS.
 * Deletes the OTP on success to prevent reuse.
 */
export async function verifyStoredOTP(
  phoneNumber: string,
  otp: string,
): Promise<{ success: boolean; reason?: "invalid" | "expired" | "locked" }> {
  const otpKey = `otp:code:${phoneNumber}`;
  const attemptsKey = `otp:attempts:${phoneNumber}`;

  // Check attempt count before doing anything
  const attemptsRaw = await redisConnection.get(attemptsKey);
  const attempts = attemptsRaw ? parseInt(attemptsRaw, 10) : 0;

  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    return { success: false, reason: "locked" };
  }

  const storedOTP = await redisConnection.get(otpKey);

  if (!storedOTP) {
    return { success: false, reason: "expired" };
  }

  if (storedOTP !== otp) {
    // Increment attempt counter, expire it alongside the OTP window
    const newAttempts = await redisConnection.incr(attemptsKey);
    if (newAttempts === 1) {
      await redisConnection.expire(attemptsKey, 600);
    }
    return { success: false, reason: "invalid" };
  }

  // Valid OTP — delete both keys atomically to prevent reuse
  await redisConnection.pipeline().del(otpKey).del(attemptsKey).exec();

  return { success: true };
}
