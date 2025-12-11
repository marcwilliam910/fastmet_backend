import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    senderType: {
      type: String,
      enum: ["client", "driver"],
      required: true,
    },
    text: { type: String, default: "" },
    image: { type: String, default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

MessageSchema.index({ conversationId: 1, createdAt: -1 });

const MessageModel = mongoose.model("Message", MessageSchema);
export default MessageModel;
