import { RequestHandler } from "express";
import mongoose from "mongoose";
import ConversationModel from "../../models/Conversation";
import { getUserId } from "../../utils/helpers/getUserId";

export const getConversations: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);
  const { page = 1, limit = 5 } = req.query;

  if (!driverId) {
    return res.status(400).json({ message: "Missing ID" });
  }

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const conversations = await ConversationModel.find({
    driver: new mongoose.Types.ObjectId(driverId),
    lastMessageAt: { $ne: null },
  })
    .sort({ updatedAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .populate({
      path: "client",
      select: "fullName profilePictureUrl phoneNumber gender",
    })
    .lean();

  // Get total count to know if there are more pages
  const total = await ConversationModel.countDocuments({
    driver: new mongoose.Types.ObjectId(driverId),
  });

  res.status(200).json({
    conversations,
    nextPage: pageNum * limitNum < total ? pageNum + 1 : null,
  });
};

export const getConversationById: RequestHandler = async (req, res) => {
  const { conversationId } = req.params;

  const conversation = await ConversationModel.findById(conversationId)
    .populate("client", "fullName profilePictureUrl phoneNumber gender")
    .lean();

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  res.json(conversation);
};
