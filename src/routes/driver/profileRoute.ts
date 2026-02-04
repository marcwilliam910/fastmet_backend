import { Router } from "express";
import {
  getDriverStatus,
  addDriverProfile,
  uploadMultipleDriverImages,
  updateServiceAreas,
  updateDriverProfile,
} from "../../controllers/driver/profileController";
import { upload } from "../../utils/mutler";

const router = Router();

router.get("/status", getDriverStatus);
router.post("/", upload.single("profilePicture"), addDriverProfile);
router.post(
  "/documents-upload",
  upload.array("images"),
  uploadMultipleDriverImages
);
router.patch("/update-service-areas", updateServiceAreas);
router.patch(
  "/update-profile",
  upload.single("profilePicture"),
  updateDriverProfile
);

export default router;
