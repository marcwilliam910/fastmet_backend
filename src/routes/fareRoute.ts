import { Router } from "express";

import { updateFareRates, getFareRates } from "../controllers/fareController";

const router = Router();

router.get("/", getFareRates);
router.patch("/", updateFareRates);

export default router;
