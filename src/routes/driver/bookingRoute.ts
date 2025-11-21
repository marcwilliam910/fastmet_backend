import { Router } from "express";

import { getPendingBookings } from "../../controllers/driver/bookingController";

const router = Router();

router.get("/pending", getPendingBookings);

export default router;
