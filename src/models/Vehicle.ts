import { Schema, model, Document, Types } from "mongoose";

interface IPricingTier {
  minKm: number; // inclusive
  maxKm?: number; // undefined = infinity
  pricePerKm: number;
}

// Add search configuration interface
export interface ISearchConfig {
  initialRadiusKm: number;
  incrementKm: number;
  maxRadiusKm: number;
  intervalMs: number;
}

export interface ILoadVariant {
  maxLoadKg: number;
  baseFare: number;
  pricingTiers: IPricingTier[];
  isActive: boolean;
  _id: Types.ObjectId;
}

interface IService {
  key: string; // extra_helper, extra_waiting_time, special_help, etc.
  name: string; // Display name: "Extra Helper", "Extra Waiting Time"
  desc: string; // Description of what this service includes
  price: number; // Price in PHP (0 for free services)
  unit: string; // "per person", "per 15 minutes", "per service", etc.
  isQuantifiable: boolean; // true if user can request multiple (like extra helpers), false for one-time services
  maxQuantity?: number; // Optional: max quantity user can request (e.g., max 5 helpers)
  isActive: boolean;
}

export interface IVehicleType extends Document {
  key: string; // motorcycle, sedan, l300, closed_van, wing_van
  name: string; // UI display
  imageUrl: string; // Cloudinary
  desc: string; // Description of the vehicle type
  variants: ILoadVariant[];
  freeServices: IService[];
  paidServices: IService[];
  searchConfig: ISearchConfig; // Add this field
  isActive: boolean;
}

const pricingTierSchema = new Schema<IPricingTier>(
  {
    minKm: { type: Number, required: true },
    maxKm: { type: Number },
    pricePerKm: { type: Number, required: true },
  },
  { _id: false },
);

const loadVariantSchema = new Schema<ILoadVariant>({
  maxLoadKg: { type: Number, required: true },
  baseFare: { type: Number, required: true },
  pricingTiers: {
    type: [pricingTierSchema],
    required: true,
  },
  isActive: { type: Boolean, default: true },
});

const serviceSchema = new Schema<IService>(
  {
    key: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    desc: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      required: true,
    },
    isQuantifiable: {
      type: Boolean,
      required: true,
      default: false,
    },
    maxQuantity: {
      type: Number,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false },
);

// Add search config schema
const searchConfigSchema = new Schema<ISearchConfig>(
  {
    initialRadiusKm: {
      type: Number,
      required: true,
      min: 0.1,
    },
    incrementKm: {
      type: Number,
      required: true,
      min: 0.1,
    },
    maxRadiusKm: {
      type: Number,
      required: true,
      min: 0.1,
    },
    intervalMs: {
      type: Number,
      required: true,
      min: 1000,
    },
  },
  { _id: false },
);

const vehicleTypeSchema = new Schema<IVehicleType>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
      required: true,
    },
    desc: {
      type: String,
      required: true,
    },
    variants: {
      type: [loadVariantSchema],
      required: true,
    },
    freeServices: {
      type: [serviceSchema],
      default: [],
    },
    paidServices: {
      type: [serviceSchema],
      default: [],
    },
    searchConfig: {
      type: searchConfigSchema,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

export const VehicleType = model<IVehicleType>(
  "VehicleType",
  vehicleTypeSchema,
);
