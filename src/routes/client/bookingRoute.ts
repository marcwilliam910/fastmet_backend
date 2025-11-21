import { Router } from "express";
import { getBookings } from "../../controllers/client/bookingController";

const router = Router();

router.get("/:userId", getBookings);

export default router;
