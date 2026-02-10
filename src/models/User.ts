import { Schema, model } from "mongoose";

const userAddressCoordsSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const userAddressSchema = new Schema(
  {
    name: { type: String, required: true },
    fullAddress: { type: String, required: true },
    coords: { type: userAddressCoordsSchema, required: true },
    street: { type: String, default: undefined },
    barangay: { type: String, default: undefined },
    city: { type: String, default: undefined },
    province: { type: String, default: undefined },
    postalCode: { type: String, default: undefined },
  },
  { _id: false },
);

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
    address: { type: userAddressSchema, default: null },
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
  { timestamps: true },
);

userSchema.index({ fullName: 1 });

const UserModel = model("User", userSchema);
export default UserModel;
