import { Router } from "express";
import {
  getConversationById,
  getConversationByName,
  getConversations,
  getUnreadConversationsCount,
} from "../../controllers/client/conversationController";

const router = Router();

router.get("/", getConversations);
router.get("/unread-count", getUnreadConversationsCount);
router.get("/by-name/:name", getConversationByName);
router.get("/conversation/:conversationId", getConversationById);

export default router;
