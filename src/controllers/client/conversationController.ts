import { RequestHandler } from "express";
import mongoose from "mongoose";
import ConversationModel from "../../models/Conversation";
import { getUserId } from "../../utils/helpers/getUserId";
import DriverModel from "../../models/Driver";
import Conversation from "../../models/Conversation";

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
    lastMessageAt: { $ne: null },
  })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .populate({
      path: "driver",
      select: "firstName lastName profilePictureUrl phoneNumber", // select needed fields
    })
    .sort({ lastMessageAt: -1 })
    .lean();
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

  let conversation = await ConversationModel.findById(conversationId)
    .populate("driver", "firstName lastName profilePictureUrl phoneNumber")
    .lean();

  // If conversation does not exist, create it
  if (!conversation) {
    const [id1, id2] = conversationId.split("_");

    if (!id1 || !id2) {
      return res
        .status(400)
        .json({ message: "Invalid conversation ID format." });
    }

    const clientId = getUserId(req);
    let driverId: string | undefined;

    // Determine which ID belongs to driver
    if (clientId === id1) {
      driverId = id2;
    } else if (clientId === id2) {
      driverId = id1;
    } else {
      return res
        .status(403)
        .json({ message: "You are not authorized for this conversation." });
    }

    const newConversation = new ConversationModel({
      _id: conversationId,
      client: clientId,
      driver: driverId,
    });

    await newConversation.save();

    conversation = await ConversationModel.findById(conversationId)
      .populate("driver", "firstName lastName profilePictureUrl phoneNumber")
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
  const clientId = getUserId(req);

  if (!name || name.trim().length === 0) {
    return res.status(400).json({ message: "Name parameter is required" });
  }

  // Escape special regex characters to prevent regex injection
  const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const drivers = await DriverModel.find({
    $or: [
      { firstName: { $regex: escapedName, $options: "i" } },
      { lastName: { $regex: escapedName, $options: "i" } },
      {
        $expr: {
          $regexMatch: {
            input: { $concat: ["$firstName", " ", "$lastName"] },
            regex: escapedName,
            options: "i",
          },
        },
      },
    ],
  }).select("_id");

  if (drivers.length === 0) {
    return res.status(200).json({ conversations: [] });
  }

  const driverIds = drivers.map((driver) => driver._id);

  const conversations = await Conversation.find({
    client: new mongoose.Types.ObjectId(clientId),
    driver: { $in: driverIds },
  })
    .populate({
      path: "driver",
      select: "firstName lastName profilePictureUrl phoneNumber",
    })
    .sort({ lastMessageAt: -1 })
    .lean();

  res.status(200).json({
    conversations,
  });
};

export const getUnreadConversationsCount: RequestHandler = async (req, res) => {
  const clientId = getUserId(req);
  if (!clientId) {
    return res.status(400).json({ message: "Missing ID" });
  }
  const unreadConversationsCount = await ConversationModel.countDocuments({
    client: new mongoose.Types.ObjectId(clientId),
    "unreadCount.client": { $gt: 0 },
  });
  res.status(200).json({ unreadConversationsCount });
};
