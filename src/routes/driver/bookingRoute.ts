import { Router } from "express";

import {
  // getActiveBooking,
  getBookings,
  getTotalCompletedAndScheduledBookings,
  uploadReceipt,
} from "../../controllers/driver/bookingController";
import { upload } from "../../utils/mutler";

const router = Router();

// not used currently
// router.get("/active", getActiveBooking);

router.get("/by-status", getBookings);
router.get("/total", getTotalCompletedAndScheduledBookings);
router.post("/receipt", upload.single("receipt"), uploadReceipt);

export default router;
