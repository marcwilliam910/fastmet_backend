import mongoose from "mongoose";

const ConversationSchema = new mongoose.Schema(
  {
    _id: { type: String }, // clientId_driverId (sorted)
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },
    lastMessage: { type: String },
    lastMessageBy: { type: String, enum: ["client", "driver"] }, // "client" or "driver"
    lastMessageAt: { type: Date },
    unreadCount: {
      client: { type: Number, default: 0 },
      driver: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

// Indexes for efficient querying
// 1. Client conversations (already exists)
ConversationSchema.index({ client: 1 });

// 2. Driver conversations (already exists)
ConversationSchema.index({ driver: 1 });

// 3. Client conversations pagination: client + lastMessageAt (desc)
ConversationSchema.index({ client: 1, lastMessageAt: -1 });

// 4. Driver conversations pagination: driver + lastMessageAt (desc)
ConversationSchema.index({ driver: 1, lastMessageAt: -1 });

// 5. Client unread count queries: client + unreadCount.client
ConversationSchema.index({ client: 1, "unreadCount.client": 1 });

// 6. Driver unread count queries: driver + unreadCount.driver
ConversationSchema.index({ driver: 1, "unreadCount.driver": 1 });

// 7 for searching by name
ConversationSchema.index({ client: 1, driver: 1 });

const ConversationModel = mongoose.model("Conversation", ConversationSchema);
export default ConversationModel;
