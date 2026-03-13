import { Router } from "express";
import { login } from "../../controllers/client/authController";

const router = Router();

router.post("/login", login);

export default router;
