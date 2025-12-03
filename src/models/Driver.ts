import { model, Schema } from "mongoose";

const driverSchema = new Schema(
  {
    phone_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true, // ✅ Allows null but enforces uniqueness
      trim: true,
      lowercase: true,
    },
    vehicle: {
      type: String,
      enum: ["car", "motorcycle", "truck", "van"],
    },
    name: {
      type: String,
      trim: true,
    },
    rating: {
      type: Number,
      default: 5.0,
      min: 0,
      max: 5,
    },
    birthDate: { type: Date },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },
    profilePictureUrl: { type: String },
    isProfileComplete: {
      type: Boolean,
      default: false,
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    preRegId: {
      type: Schema.Types.ObjectId,
      ref: "PreRegDriver",
    },
  },
  { timestamps: true }
);

const DriverModel = model("Driver", driverSchema);
export default DriverModel;
