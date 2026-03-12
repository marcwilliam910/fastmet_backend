import { model, Schema } from "mongoose";

const PreRegUserSchema = new Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
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
    gender: { type: String, enum: ["male", "female", "prefer_not"] },
  },
  { timestamps: true },
);

export const PreRegUserModel = model("Pre_Reg_User", PreRegUserSchema);
