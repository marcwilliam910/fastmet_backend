import rateLimit from "express-rate-limit";

// IP-based rate limiter for OTP sending
export const otpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 OTP requests per IP per hour
  message: {
    error: "Too many OTP requests from this device. Please try again later.",
    success: false,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});

// IP-based rate limiter for OTP verification
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Max 15 verify attempts per IP per 15 minutes
  message: {
    error: "Too many verification attempts. Please try again later.",
    success: false,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
});
