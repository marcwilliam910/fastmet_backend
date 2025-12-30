import { Router } from "express";
import {
  getBooking,
  getBookingsByStatus,
  getBookingsCount,
  uploadBookingImage,
} from "../../controllers/client/bookingController";
import { upload } from "../../utils/mutler";

const router = Router();

router.get("/filters/by-status", getBookingsByStatus);
router.get("/stats/counts", getBookingsCount);
router.get("/:bookingId", getBooking);
router.post("/upload-image", upload.array("images"), uploadBookingImage);

export default router;
