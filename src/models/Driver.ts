import { model, Schema, Document, Types } from "mongoose";

export interface IDriverRating {
  average: number;
  count: number;
  total: number;
}

export interface IDriver extends Document {
  phoneNumber: string;
  vehicle: Types.ObjectId;
  firstName: string;
  lastName: string;
  rating: IDriverRating;
  birthDate?: Date;
  gender?: "male" | "female" | "other";
  profilePictureUrl?: string;
  registrationStep: number;
  approvalStatus: "pending" | "approved" | "rejected";
  preRegId?: Types.ObjectId;
  licenseNumber?: string;
  images: {
    selfie?: string;
    selfieWithLicense?: string;
    front?: string;
    sideLeft?: string;
    sideRight?: string;
    back?: string;
    or?: string;
    cr?: string;
    engine?: string;
    chassis?: string;
  };
  expoPushToken?: string;
  pushNotificationsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const driverSchema = new Schema<IDriver>(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    vehicle: {
      type: Schema.Types.ObjectId,
      ref: "VehicleType",
    },

    firstName: {
      type: String,
      trim: true,
    },

    lastName: {
      type: String,
      trim: true,
    },

    rating: {
      average: {
        type: Number,
        default: 5.0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
      },
      total: {
        type: Number,
        default: 0,
      },
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

const DriverModel = model<IDriver>("Driver", driverSchema);
export default DriverModel;
