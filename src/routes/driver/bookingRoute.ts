import { Router } from "express";

import {
  getActiveBooking,
  getCompletedBookings,
} from "../../controllers/driver/bookingController";

const router = Router();

router.get("/active/:driverId", getActiveBooking);
router.get("/completed/:driverId", getCompletedBookings);

export default router;
