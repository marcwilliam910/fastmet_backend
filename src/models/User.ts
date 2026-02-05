import { Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    fullName: { type: String },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    gender: { type: String, enum: ["male", "female", "prefer_not"] },
    address: { type: String },
    profilePictureUrl: { type: String },
    isProfileComplete: { type: Boolean, default: false },
    expoPushToken: {
      type: String,
      default: null,
    },
    pushNotificationsEnabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const UserModel = model("User", userSchema);
export default UserModel;
