import { Router } from "express";
import {
  otpSendLimiter,
  otpVerifyLimiter,
} from "../middlewares/otpSendLimiter";
import {
  sendOTPWeb,
  sendOTPMobile,
  verifyOTP,
} from "../controllers/otpController";

const router = Router();

router.post("/send-otp", otpSendLimiter, sendOTPMobile);
router.post("/send-otp-web", otpSendLimiter, sendOTPWeb);
router.post("/verify-otp", otpVerifyLimiter, verifyOTP);

export default router;
