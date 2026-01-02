import { model, Schema } from "mongoose";

const driverSchema = new Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
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

    profilePictureUrl: { type: String, default: null },

    registrationStep: {
      type: Number,
      default: 1,
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

    licenseNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    images: {
      // Step 1
      selfie: { type: String, default: null },
      selfieWithLicense: { type: String, default: null },

      // Step 2 – Vehicle Exterior
      front: { type: String, default: null },
      sideLeft: { type: String, default: null },
      sideRight: { type: String, default: null },
      back: { type: String, default: null },

      // Step 3 – Documents + Engine + Chassis
      or: { type: String, default: null },
      cr: { type: String, default: null },
      engine: { type: String, default: null },
      chassis: { type: String, default: null },
    },
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

const DriverModel = model("Driver", driverSchema);
export default DriverModel;
