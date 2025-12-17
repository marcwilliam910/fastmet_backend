import { Router } from "express";

import {
  getActiveBooking,
  getBookings,
  getTotalCompletedAndScheduledBookings,
} from "../../controllers/driver/bookingController";

const router = Router();

// not used currently
router.get("/active", getActiveBooking);

router.get("/by-status", getBookings);
router.get("/total", getTotalCompletedAndScheduledBookings);

export default router;
