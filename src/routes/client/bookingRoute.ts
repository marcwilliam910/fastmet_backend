import { Router } from "express";
import {
  getBooking,
  getBookingsByStatus,
  getBookingsCount,
  uploadBookingImage,
} from "../../controllers/client/bookingController";
import { upload } from "../../utils/mutler";

const router = Router();

router.get("/:userId", getBookingsByStatus);
router.get("/counts/:userId", getBookingsCount);
router.get("/live/:bookingId", getBooking);
router.post("/upload-image", upload.array("images"), uploadBookingImage);

export default router;
