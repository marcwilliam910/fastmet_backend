import { Schema, model } from "mongoose";

const newUserSchema = new Schema(
  {
    fullName: { type: String },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    profilePictureUrl: { type: String },
    isProfileComplete: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const NewUserModel = model("New_User", newUserSchema);
export default NewUserModel;
