import { RequestHandler } from "express";
import mongoose from "mongoose";
import ConversationModel from "../../models/Conversation";
import { getUserId } from "../../utils/helpers/getUserId";

export const getConversations: RequestHandler = async (req, res) => {
  const clientId = getUserId(req);
  const { page = 1, limit = 5 } = req.query;

  if (!clientId) {
    return res.status(400).json({ message: "Missing ID" });
  }

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const conversations = await ConversationModel.find({
    client: new mongoose.Types.ObjectId(clientId),
  })
    .sort({ updatedAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .populate({
      path: "driver", // field that references Driver model
      select: "firstName lastName profilePictureUrl phoneNumber", // select needed fields
    })
    .lean(); // .lean() for plain JS object (optional, for better performance)

  // Get total count to know if there are more pages
  const total = await ConversationModel.countDocuments({
    client: new mongoose.Types.ObjectId(clientId),
  });

  res.status(200).json({
    conversations,
    nextPage: pageNum * limitNum < total ? pageNum + 1 : null,
  });
};

export const getConversationById: RequestHandler = async (req, res) => {
  const { conversationId } = req.params;

  const conversation = await ConversationModel.findById(conversationId)
    .populate("driver", "firstName lastName profilePictureUrl phoneNumber")
    .lean();

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  res.json(conversation);
};
