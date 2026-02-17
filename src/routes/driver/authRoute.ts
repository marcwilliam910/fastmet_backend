import { Router } from "express";
import { sendOTP, verifyOTP } from "../../controllers/driver/authController";
import {
  otpSendLimiter,
  otpVerifyLimiter,
} from "../../middlewares/otpSendLimiter";

const router = Router();

router.post("/send-otp", otpSendLimiter, sendOTP);
router.post("/verify-otp", otpVerifyLimiter, verifyOTP);

export default router;
