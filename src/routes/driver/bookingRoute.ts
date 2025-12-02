import { Router } from "express";

import { getActiveBookings } from "../../controllers/driver/bookingController";

const router = Router();

// router.get("/pending", getPendingBookings);
router.get("/active/:driverId", getActiveBookings);

export default router;
