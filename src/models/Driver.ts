import { model, Schema, Document, Types } from "mongoose";
import { METRO_MANILA_CITIES } from "../utils/helpers/locationHelpers";

export interface IDriverRating {
  average: number;
  count: number;
  total: number;
}

export interface IDriver extends Document {
  phoneNumber: string;
  vehicle: Types.ObjectId;
  vehicleVariant: Types.ObjectId;
  firstName: string;
  lastName: string;
  rating: IDriverRating;
  // birthDate?: Date;
  gender?: "male" | "female" | "other";
  profilePictureUrl?: string;
  registrationStep: number;
  approvalStatus: "pending" | "approved" | "rejected";
  preRegId?: Types.ObjectId;
  licenseNumber?: string;
  images: {
    selfie?: string;
    selfieWithLicense?: string;
    frontView?: string;
    sideLeftView?: string;
    sideRightView?: string;
    backView?: string;
    or?: string;
    cr?: string;
    engine?: string;
    chassis?: string;
  };
  expoPushToken?: string;
  pushNotificationsEnabled: boolean;
  serviceAreas?: string[];
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

    vehicleVariant: {
      type: Schema.Types.ObjectId,
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

    // birthDate: { type: Date },

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
      validate: {
        validator: function (v: string | null) {
          // Allow null or empty (not required)
          if (v === null || v === undefined || v === "") return true;
          // PH License number pattern (eg: N12-34-567890, B12-34-567890, D12-12-123456, A12-34-567890, etc)
          // Accepts formats like: LLL-NN-NNNNNN or LL-NN-NNNNNN (L=Letter, N=Number), dashes optional
          // More generally: 1 to 3 uppercase letters, dash, 2 digits, dash, 6 digits (but sometimes 5 digits allowed)
          // Common: A##-##-###### or A##-##-##### or AA##-##-###### etc
          const phLicenseRegex = /^[A-Z]{1,3}\d{2}-\d{2}-\d{5,6}$/;
          return phLicenseRegex.test(v);
        },
        message:
          "License number must be in valid Philippine driver's license format (e.g., D12-34-567890)",
      },
    },

    images: {
      // Step 1
      selfie: { type: String, default: null },
      selfieWithLicense: { type: String, default: null },

      // Step 2 – Vehicle Exterior
      frontView: { type: String, default: null },
      sideLeftView: { type: String, default: null },
      sideRightView: { type: String, default: null },
      backView: { type: String, default: null },

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
    serviceAreas: {
      type: [String],
      enum: [...METRO_MANILA_CITIES, "Metro Manila"], // 🆕 Include "Metro Manila" as option
      default: [],
      // required: true,
      // validate: {
      //   validator: function (areas: string[]) {
      //     return areas.length > 0; // At least one service area required
      //   },
      //   message: "At least one service area is required",
      // },
    },
  },
  { timestamps: true }
);

// Indexes for efficient querying
// 1. Service area queries (already exists)
driverSchema.index({ serviceAreas: 1 });

// 2. Approval status filtering
driverSchema.index({ approvalStatus: 1 });

// 3. Vehicle reference lookup
driverSchema.index({ vehicle: 1 });

// 4. Service area + approval status compound (for finding approved drivers in areas)
driverSchema.index({ serviceAreas: 1, approvalStatus: 1 });
// Note: phoneNumber and licenseNumber are already indexed automatically due to unique constraint

const DriverModel = model<IDriver>("Driver", driverSchema);
export default DriverModel;
