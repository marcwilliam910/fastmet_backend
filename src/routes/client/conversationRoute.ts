import { Router } from "express";
import {
  getConversationById,
  getConversations,
} from "../../controllers/client/conversationController";

const router = Router();

router.get("/conversations", getConversations);
router.get("/conversations/:conversationId", getConversationById);

export default router;
