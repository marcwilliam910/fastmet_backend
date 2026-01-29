import {Router} from "express";
import {
  getDriverStatus,
  updateDriverProfile,
  updateServiceAreas,
  uploadMultipleDriverImages,
} from "../../controllers/driver/profileController";
import {upload} from "../../utils/mutler";

const router = Router();

router.get("/status", getDriverStatus);
router.patch("/", upload.single("profilePicture"), updateDriverProfile);
router.post(
  "/documents-upload",
  upload.array("images"),
  uploadMultipleDriverImages,
);
router.patch("/update-service-areas", updateServiceAreas);

export default router;
