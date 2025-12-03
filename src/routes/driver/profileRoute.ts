import { Router } from "express";
import {
  updateDriverProfile,
  upload,
  uploadMultipleDriverImages,
} from "../../controllers/driver/profileController";

const router = Router();

// router.get("/pending", getPendingBookings);
router.patch("/", updateDriverProfile);
router.post(
  "/documents-upload",
  upload.array("images"),
  uploadMultipleDriverImages
);

export default router;
