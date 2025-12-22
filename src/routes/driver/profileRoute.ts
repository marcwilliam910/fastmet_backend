import { Router } from "express";
import {
  updateDriverProfile,
  uploadMultipleDriverImages,
} from "../../controllers/driver/profileController";
import { upload } from "../../utils/mutler";

const router = Router();

// router.get("/pending", getPendingBookings);
router.patch("/", updateDriverProfile);
router.post(
  "/documents-upload",
  upload.array("images"),
  uploadMultipleDriverImages
);

export default router;
