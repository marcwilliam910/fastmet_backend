import { Router } from "express";
import { getBookingTypes } from "../controllers/bookingTypeController";

const router = Router();

router.get("/", getBookingTypes);

export default router;
