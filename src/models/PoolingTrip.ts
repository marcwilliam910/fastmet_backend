import { Schema, Document, model } from "mongoose";

export interface IPoolingStop {
  bookingId: Schema.Types.ObjectId;
  type: "pickup" | "dropoff";
  label: string; // "P1", "P2", "D1", "D2"
  coords: {
    lat: number;
    lng: number;
  };
  order: number; // 0-based, from Mapbox optimized order
  completed: boolean;
  completedAt: Date | null;
}

export interface IPoolingTrip extends Document {
  driverId: Schema.Types.ObjectId;
  bookingIds: Schema.Types.ObjectId[];
  stops: IPoolingStop[];
  currentStopIndex: number;
  status: "active" | "completed" | "cancelled";
  totalDistance: number; // km, from Mapbox
  totalDuration: number; // minutes, from Mapbox
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const poolingStopSchema = new Schema<IPoolingStop>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Booking",
    },
    type: {
      type: String,
      required: true,
      enum: ["pickup", "dropoff"],
    },
    label: {
      type: String,
      required: true, // "P1", "D1", etc.
    },
    coords: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    order: {
      type: Number,
      required: true,
    },
    completed: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const poolingTripSchema = new Schema<IPoolingTrip>(
  {
    driverId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Driver",
    },
    bookingIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Booking",
      },
    ],
    stops: [poolingStopSchema],
    currentStopIndex: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      required: true,
      default: "active",
      enum: ["active", "completed", "cancelled"],
    },
    totalDistance: {
      type: Number,
      required: true,
    },
    totalDuration: {
      type: Number,
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// 1. Find active trip by driver
poolingTripSchema.index({ driverId: 1, status: 1 });

// 2. Look up trip by any booking in the pool
poolingTripSchema.index({ bookingIds: 1 });

const PoolingTripModel = model<IPoolingTrip>("PoolingTrip", poolingTripSchema);
export default PoolingTripModel;
