import {Router} from "express";
import {getProfile, registerProfile} from "../controllers/userController";
const router = Router();

router.get("/:uid", getProfile);

router.post("/register-profile", registerProfile);

export default router;
