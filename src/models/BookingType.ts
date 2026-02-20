import mongoose, { Document, Schema } from "mongoose";

export interface ISubOption {
  key: string;
  name: string;
  icon: string;
  subtext?: string;
  description: string;
  priceModifier: number; // multiplier on distanceFee (e.g. 1.1 = +10%, 0.9 = -10%)
  isActive: boolean;
  order: number;
}

export interface IBookingType extends Document {
  key: string;
  name: string;
  icon: string;
  subtext?: string;
  description: string;
  priceModifier: number; // used only when subOptions is empty
  subOptions: ISubOption[];
  isActive: boolean;
  order: number;
}

const SubOptionSchema = new Schema<ISubOption>(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    icon: { type: String, required: true },
    subtext: { type: String },
    description: { type: String, required: true },
    priceModifier: { type: Number, required: true, default: 1.0 },
    isActive: { type: Boolean, default: true },
    order: { type: Number, required: true },
  },
  { _id: false },
);

const BookingTypeSchema = new Schema<IBookingType>(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    icon: { type: String, required: true },
    subtext: { type: String },
    description: { type: String, required: true },
    priceModifier: { type: Number, required: true, default: 1.0 },
    subOptions: { type: [SubOptionSchema], default: [] },
    isActive: { type: Boolean, default: true },
    order: { type: Number, required: true },
  },
  { timestamps: true },
);

export const BookingType = mongoose.model<IBookingType>(
  "BookingType",
  BookingTypeSchema,
);
