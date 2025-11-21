import { Router } from "express";
import {
  getProfile,
  registerProfile,
  updateProfile,
} from "../../controllers/client/userController";

const router = Router();

router.get("/:uid", getProfile);

router.post("/register-profile", registerProfile);

router.put("/update-profile/:uid", updateProfile);

export default router;
