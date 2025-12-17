import mongoose from "mongoose";

const ConversationSchema = new mongoose.Schema(
  {
    _id: { type: String }, // clientId_driverId (sorted)
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "New_User",
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
  { timestamps: true }
);

ConversationSchema.index({ client: 1 });
ConversationSchema.index({ driver: 1 });

const ConversationModel = mongoose.model("Conversation", ConversationSchema);
export default ConversationModel;
