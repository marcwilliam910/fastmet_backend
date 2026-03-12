import { Router } from "express";
import {
  getRegistrationCounts,
  registerPreRegDriver,
  registerPreRegUser,
} from "../controllers/registrationController";

const router = Router();

router.post("/register-driver", registerPreRegDriver);
router.post("/register-user", registerPreRegUser);
router.get("/counts", getRegistrationCounts);

export default router;
