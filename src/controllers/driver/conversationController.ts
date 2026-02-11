import { RequestHandler } from "express";
import mongoose from "mongoose";
import ConversationModel from "../../models/Conversation";
import { getUserId } from "../../utils/helpers/getUserId";
import User from "../../models/User";
import Conversation from "../../models/Conversation";

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
    .sort({ lastMessageAt: -1 })
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

  let conversation = await ConversationModel.findById(conversationId)
    .populate("client", "fullName profilePictureUrl phoneNumber gender")
    .lean();

  // If not found, create a new conversation entry using clientId and driverId from conversationId
  if (!conversation) {
    // Split the conversationId to get clientId and driverId
    const [id1, id2] = conversationId.split("_");
    if (!id1 || !id2) {
      return res
        .status(400)
        .json({ message: "Invalid conversation ID format." });
    }

    // You may decide on order: check which of these is the driver and which is the client
    // For driver endpoint, assume driver is current user
    const driverId = getUserId(req);
    let clientId: string | undefined;

    if (driverId === id1) {
      clientId = id2;
    } else if (driverId === id2) {
      clientId = id1;
    } else {
      // Current driver is not part of the conversation
      return res
        .status(403)
        .json({ message: "You are not authorized for this conversation." });
    }

    // Create conversation
    const newConversation = new ConversationModel({
      _id: conversationId,
      client: clientId,
      driver: driverId,
    });

    await newConversation.save();

    // Fetch with population for full response
    conversation = await ConversationModel.findById(conversationId)
      .populate("client", "fullName profilePictureUrl phoneNumber gender")
      .lean();

    if (!conversation) {
      return res
        .status(500)
        .json({ message: "Failed to create conversation." });
    }
  }

  res.json(conversation);
};

export const getConversationByName: RequestHandler = async (req, res) => {
  const { name } = req.params;
  const driverId = getUserId(req);

  // Validate input
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ message: "Name parameter is required" });
  }

  // Escape special regex characters to prevent regex injection
  const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // First, find all clients matching the name
  const clients = await User.find({
    fullName: { $regex: escapedName, $options: "i" },
  }).select("_id");

  // Early return if no clients found
  if (clients.length === 0) {
    return res.status(200).json({ conversations: [] });
  }

  const clientIds = clients.map((client) => client._id);

  // Then find conversations with those client IDs
  const conversations = await Conversation.find({
    client: { $in: clientIds },
    driver: new mongoose.Types.ObjectId(driverId),
  })
    .populate({
      path: "client",
      select: "fullName profilePictureUrl phoneNumber gender",
    })
    .sort({ lastMessageAt: -1 })
    .lean();

  res.status(200).json({
    conversations,
  });
};

export const getUnreadConversationsCount: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);
  if (!driverId) {
    return res.status(400).json({ message: "Missing ID" });
  }
  const unreadConversationsCount = await ConversationModel.countDocuments({
    driver: new mongoose.Types.ObjectId(driverId),
    "unreadCount.driver": { $gt: 0 },
  });
  console.log(unreadConversationsCount);
  res.status(200).json({ unreadConversationsCount });
};
