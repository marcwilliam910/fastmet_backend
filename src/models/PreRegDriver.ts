import { model, Schema } from "mongoose";

const PreRegDriverSchema = new Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    vehicle: {
      type: String,
      required: true,
      enum: ["car", "motorcycle", "truck", "van"],
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    seminarEmailSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const PreRegDriverModel = model("Pre_Reg_Driver", PreRegDriverSchema);
