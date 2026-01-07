import { Server } from "socket.io";
import { CustomSocket } from "../socket";
import { withErrorHandling } from "../../utils/socketWrapper";
import ConversationModel from "../../models/Conversation";
import MessageModel from "../../models/Message";
import cloudinary from "../../config/cloudinary";
import { createConversationId } from "../../utils/helpers/createConversationId";

export function chatHandler(socket: CustomSocket, io: Server) {
  const on = withErrorHandling(socket);

  // JOIN CONVERSATION ROOM
  on("join_room", async ({ clientId, driverId }) => {
    const conversationId = createConversationId(clientId, driverId);
    socket.join(conversationId);

    console.log(
      `${socket.userType} ${socket.userId} joined room: ${conversationId}`
    );

    await ConversationModel.findByIdAndUpdate(
      conversationId,
      {
        _id: conversationId,
        client: clientId,
        driver: driverId,
      },
      { upsert: true, new: true }
    );

    socket.emit("room_joined", {
      conversationId,
      success: true,
    });
  });
  // GET MESSAGE HISTORY
  on("get_messages", async ({ conversationId, limit = 20, skip = 0 }) => {
    const messages = await MessageModel.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    socket.emit("messages_loaded", {
      conversationId,
      messages,
      skip,
      hasMore: messages.length === limit, // frontend decides if more exists
    });
  });

  // SEND MESSAGE
  on("send_message", async (payload) => {
    const { conversationId, senderId, text, image, receiverId, name } = payload;

    if (socket.userId !== senderId) {
      socket.emit("message_error", { error: "Unauthorized" });
      return;
    }

    const senderType = socket.userType;
    let imageUrl = null;
    // Upload image to Cloudinary if provided
    if (image) {
      try {
        // Extract base64 data from the image URI (if it's data URI)
        const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        // Upload to Cloudinary
        const result = await new Promise<any>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: `fastmet/chats/${conversationId}`,
              resource_type: "image",
            },
            (error, result) => {
              if (error || !result) reject(error);
              else resolve(result);
            }
          );

          stream.end(buffer);
        });

        imageUrl = result.secure_url;
      } catch (error) {
        console.error("Image upload failed:", error);
        socket.emit("message_error", { error: "Image upload failed" });
        return;
      }
    }

    // Save message to DB
    const savedMessage = await MessageModel.create({
      conversationId,
      senderId,
      senderType,
      text,
      image: imageUrl,
    });

    // Determine other user type and ID
    const otherUserType = senderType === "client" ? "driver" : "client";

    // Update conversation metadata
    await ConversationModel.findByIdAndUpdate(conversationId, {
      $set: {
        lastMessage: text || "Sent an image",
        lastMessageBy: senderType,
        lastMessageAt: new Date(),
      },
      $inc: {
        [`unreadCount.${otherUserType}`]: 1,
      },
    });

    const messageData = {
      _id: savedMessage._id,
      conversationId: savedMessage.conversationId,
      senderId: savedMessage.senderId,
      senderType: savedMessage.senderType,
      text: savedMessage.text,
      image: savedMessage.image,
      createdAt: savedMessage.createdAt,
    };

    // 1. Broadcast to conversation room (for users actively chatting)
    io.to(conversationId).emit("receive_message", messageData);

    // 2. Get count of conversations with unread messages
    const unreadConversationsCount = await ConversationModel.countDocuments({
      [otherUserType]: receiverId,
      [`unreadCount.${otherUserType}`]: { $gt: 0 },
    });

    // 3. Send to recipient's personal room (for badges/notifications)
    io.to(receiverId).emit("new_message_badge", {
      sender: name,
      message: text || "Sent an image",
      unreadConversationsCount, // Number of conversations with unread messages
    });

    console.log(
      `Message sent to conversation ${conversationId} and user ${receiverId}`
    );
  });

  // MARK MESSAGES AS READ //no sender
  // on("mark_as_read", async ({ conversationId }) => {
  //   const updateField =
  //     socket.userType === "client"
  //       ? "unreadCount.client"
  //       : "unreadCount.driver";

  //   await ConversationModel.findByIdAndUpdate(conversationId, {
  //     [updateField]: 0,
  //   });

  //   await MessageModel.updateMany(
  //     {
  //       conversationId,
  //       senderId: { $ne: socket.userId },
  //       read: false,
  //     },
  //     { read: true }
  //   );

  //   console.log(`Messages marked as read in ${conversationId}`);
  // });

  // start up app
  on("get_unread_conversations_count", async () => {
    const userIdField =
      socket.userType === "client" ? socket.userId : socket.userId;
    const unreadConversationsCount = await ConversationModel.countDocuments({
      [socket.userType]: userIdField,
      [`unreadCount.${socket.userType}`]: { $gt: 0 },
    });

    socket.emit("unread_conversations_count", { unreadConversationsCount });
  });

  // LEAVE ROOM
  on("leave_room", async ({ conversationId }) => {
    socket.leave(conversationId);
    const updateField =
      socket.userType === "client"
        ? "unreadCount.client"
        : "unreadCount.driver";

    await ConversationModel.findByIdAndUpdate(
      conversationId,
      {
        [updateField]: 0, // Reset unread count for the joining user
      },
      { new: true }
    );

    // Get updated count after resetting
    const unreadConversationsCount = await ConversationModel.countDocuments({
      [socket.userType]: socket.userId,
      [`unreadCount.${socket.userType}`]: { $gt: 0 },
    });

    // Emit to user's personal room to update badge
    io.to(socket.userId).emit("unread_conversations_updated", {
      unreadConversationsCount,
    });
    console.log(`${socket.userType} left room: ${conversationId}`);
  });
}
