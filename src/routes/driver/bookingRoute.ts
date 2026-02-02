import { Router } from "express";

import {
  // getActiveBooking,
  getBookings,
  getAllBookingsCount,
  uploadReceipt,
  getCompletedCountData,
  getOfferedBookingsCount,
} from "../../controllers/driver/bookingController";
import { upload } from "../../utils/mutler";

const router = Router();

// not used currently
// router.get("/active", getActiveBooking);

router.get("/by-status", getBookings);
router.get("/total", getAllBookingsCount);
router.get("/offered-total", getOfferedBookingsCount);
router.get("/completed-count", getCompletedCountData);
router.post("/receipt", upload.array("receipt"), uploadReceipt);

export default router;
