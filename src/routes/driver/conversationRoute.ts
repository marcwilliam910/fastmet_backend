import { Router } from "express";
import {
  getConversationById,
  getConversationByName,
  getConversations,
} from "../../controllers/driver/conversationController";

const router = Router();

router.get("/conversations", getConversations);
router.get("/conversations/:conversationId", getConversationById);
router.get("/conversations/name/:name", getConversationByName);
export default router;
