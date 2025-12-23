import { Router } from "express";
import {
  registerProfile,
  updateProfile,
} from "../../controllers/client/profileController";
import { upload } from "../../utils/mutler";

const router = Router();

// router.get("/:uid", getProfile);

router.post(
  "/register-profile",
  upload.single("profilePicture"),
  registerProfile
);

router.patch("/update-profile", upload.single("profilePicture"), updateProfile);

export default router;
