import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "userType",
    },
    userType: {
      type: String,
      enum: ["Client", "Driver", "All"],
    },

    isBroadcast: {
      type: Boolean,
      default: false,
    },

    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      required: true,
    },

    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },

    data: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

notificationSchema.index({
  userId: 1,
  userType: 1,
  type: 1,
  "data.bookingId": 1,
});

const NotificationModel = mongoose.model("Notification", notificationSchema);
export default NotificationModel;
