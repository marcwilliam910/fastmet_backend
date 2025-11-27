import { Router } from "express";
import {
  getBooking,
  getBookingsByStatus,
  getBookingsCount,
} from "../../controllers/client/bookingController";

const router = Router();

router.get("/:userId", getBookingsByStatus);
router.get("/counts/:userId", getBookingsCount);
router.get("/live/:bookingId", getBooking);

export default router;
