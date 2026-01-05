import rateLimit from "express-rate-limit";

// IP-based rate limiter for OTP sending
export const otpSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Max 10 OTP requests per IP per hour
  message: {
    error: "Too many OTP requests from this device. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests, only count when they hit the endpoint
  skipSuccessfulRequests: false,
});
