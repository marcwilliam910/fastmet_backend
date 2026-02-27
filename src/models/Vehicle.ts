import { Schema, model, Document, Types } from "mongoose";

interface IPricingTier {
  minKm: number; // inclusive
  maxKm?: number; // undefined = infinity
  pricePerKm: number;
}

interface IPoolingConfig {
  maxRequests: number;
  maxDetourPercent: number;
  maxTotalDistanceKm: number;
  maxTotalTimeMinutes: number;
}

// Search configuration interface
export interface ISearchConfig {
  initialRadiusKm: number;
  incrementKm: number;
  maxRadiusKm: number;
  intervalMs: number;
  pooling: IPoolingConfig | null; // null = vehicle doesn't support pooling
}

export interface ILoadVariant {
  maxLoadKg: number;
  baseFare: number;
  pricingTiers: IPricingTier[];
  isActive: boolean;
  _id: Types.ObjectId;
}

interface IService {
  key: string;
  name: string;
  desc: string;
  price: number;
  unit: string;
  isQuantifiable: boolean;
  maxQuantity?: number;
  isActive: boolean;
}

export interface IVehicleType extends Document {
  key: string;
  name: string;
  imageUrl: string;
  desc: string;
  variants: ILoadVariant[];
  freeServices: IService[];
  paidServices: IService[];
  searchConfig: ISearchConfig;
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

const poolingConfigSchema = new Schema<IPoolingConfig>(
  {
    maxRequests: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    maxDetourPercent: {
      type: Number,
      required: true,
      min: 0.01,
      max: 1,
    },
    maxTotalDistanceKm: {
      type: Number,
      required: true,
      min: 1,
    },
    maxTotalTimeMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false },
);

// Search config schema with pooling
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
    pooling: {
      type: poolingConfigSchema,
      default: null,
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
