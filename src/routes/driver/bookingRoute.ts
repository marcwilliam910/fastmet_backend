import { Router } from "express";

import {
  getActiveBooking,
  getCompletedBookings,
  updateBookingStatus,
} from "../../controllers/driver/bookingController";

const router = Router();

// router.get("/pending", getPendingBookings);
router.get("/active/:driverId", getActiveBooking);
router.get("/completed/:driverId", getCompletedBookings);
router.patch("/update-status/:bookingId", updateBookingStatus);

export default router;
