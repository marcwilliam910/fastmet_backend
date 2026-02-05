import { Router } from "express";
import {
  driverStatusUpdate,
  approveAllDrivers,
} from "../../controllers/admin/driverController";

const router = Router();

router.post("/status", driverStatusUpdate);
router.patch("/approve-all", approveAllDrivers);

export default router;
