import { Router } from "express";

import { updateFareRates, getFareRates } from "../controllers/fareController";
import { authenticateJWT } from "../middlewares/verifyToken";

const router = Router();

router.get("/", getFareRates);
router.patch("/", authenticateJWT, updateFareRates);

export default router;
