import { Router } from "express";

import { getVehicles } from "../controllers/vehicleController";

const router = Router();

router.get("/", getVehicles);

export default router;
