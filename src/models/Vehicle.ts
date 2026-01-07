import { Schema, model, Document } from "mongoose";

/**
 * Price per km decreases as distance increases
 */
interface IPricingTier {
  minKm: number; // inclusive
  maxKm?: number; // undefined = infinity
  pricePerKm: number;
}

/**
 * Load-based variant (e.g. 2000kg, 3000kg)
 */
interface ILoadVariant {
  maxLoadKg: number;
  baseFare: number;
  pricingTiers: IPricingTier[];
  isActive: boolean;
}

export interface IVehicleType extends Document {
  key: string; // motorcycle, sedan, l300, closed_van, wing_van
  name: string; // UI display
  imageUrl: string; // Cloudinary
  desc: string; // Description of the vehicle type
  variants: ILoadVariant[];
  isActive: boolean;
}

const pricingTierSchema = new Schema<IPricingTier>(
  {
    minKm: { type: Number, required: true },
    maxKm: { type: Number },
    pricePerKm: { type: Number, required: true },
  },
  { _id: false }
);

const loadVariantSchema = new Schema<ILoadVariant>(
  {
    maxLoadKg: { type: Number, required: true },
    baseFare: { type: Number, required: true },
    pricingTiers: {
      type: [pricingTierSchema],
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const VehicleType = model<IVehicleType>(
  "VehicleType",
  vehicleTypeSchema
);
