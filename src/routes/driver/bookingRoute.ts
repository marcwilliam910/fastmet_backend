import { Router } from "express";

import {
  getActiveBooking,
  getCompletedBookings,
  getTotalCompletedAndScheduledBookings,
} from "../../controllers/driver/bookingController";

const router = Router();

router.get("/active/", getActiveBooking);
router.get("/completed/", getCompletedBookings);
router.get("/total", getTotalCompletedAndScheduledBookings);

export default router;
