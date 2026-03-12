import { Router } from "express";
import { login } from "../../controllers/driver/authController";

const router = Router();

router.post("/login", login);

export default router;
