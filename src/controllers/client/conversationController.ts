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

  const conversation = await ConversationModel.findById(conversationId)
    .populate("driver", "firstName lastName profilePictureUrl phoneNumber")
    .lean();

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
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
