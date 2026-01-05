import { Router } from "express";
import { sendOTP, verifyOTP } from "../../controllers/client/authController";
import { otpSendLimiter } from "../../middlewares/otpSendLimiter";

const router = Router();

router.post("/send-otp", otpSendLimiter, sendOTP);
router.post("/verify-otp", verifyOTP);

export default router;
