import { Schema, Document, model } from "mongoose";

export type LocationDetails = {
  name: string;
  address: string;
  coords: { lat: number; lng: number };
  additionalDetails?: string;
};

export interface IBooking extends Document {
  customerId: Schema.Types.ObjectId;
  bookingRef: string;
  driverId: Schema.Types.ObjectId | null;
  pickUp: LocationDetails;
  dropOff: LocationDetails;
  bookingType: {
    type: string; // "asap" | "schedule"
    value: string | Date;
  };
  selectedVehicle: {
    id: string;
    name: string;
    capacity: string;
  };
  routeData: {
    distance: number;
    duration: number;
    basePrice: number;
    distanceFee: number;
    serviceFee: number;
    totalPrice: number;
  };
  paymentMethod: string; // "cash" | "online"
  addedServices: {
    id: string;
    name: string;
    price: number;
    icon?: string;
  }[];
  status: string; // "pending" | "active" | "cancelled"
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  notificationSent: boolean;
  notifiedAt: Date | null;
  proofImageUrl: string | null;
  note: string;
  itemType: string | null;
  photos: string[];
  driverRating: number | null;
}

const bookingSchema: Schema = new Schema<IBooking>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    bookingRef: { type: String, required: true, unique: true },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    },
    pickUp: {
      name: { type: String, required: true },
      address: { type: String, required: true },
      coords: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
      additionalDetails: { type: String },
    },
    dropOff: {
      name: { type: String, required: true },
      address: { type: String, required: true },
      coords: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
      additionalDetails: { type: String },
    },
    bookingType: {
      type: { type: String, required: true },
      value: { type: Schema.Types.Mixed, required: true },
    },
    selectedVehicle: {
      id: { type: String, required: true },
      name: { type: String, required: true },
      capacity: { type: String },
    },
    routeData: {
      distance: { type: Number, required: true },
      duration: { type: Number, required: true },
      basePrice: { type: Number, required: true },
      distanceFee: { type: Number, required: true },
      serviceFee: { type: Number, required: true },
      totalPrice: { type: Number, required: true },
    },
    paymentMethod: { type: String, required: true },
    addedServices: [
      new Schema(
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          price: { type: Number, required: true },
          icon: { type: String },
        },
        { _id: false }
      ),
    ],
    status: { type: String, required: true, default: "pending" },
    completedAt: { type: Date, default: null },
    notificationSent: {
      type: Boolean,
      default: false,
    },
    notifiedAt: {
      type: Date,
      default: null,
    },
    proofImageUrl: {
      type: String,
      default: null,
    },
    note: {
      type: String,
      default: "",
    },
    itemType: {
      type: String,
      default: null,
    },
    photos: {
      type: [String],
      default: [],
    },
    driverRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
  },
  { timestamps: true }
);

// Create index for efficient queries
bookingSchema.index({
  status: 1,
  "bookingType.value": 1,
  notificationSent: 1,
  driverId: 1,
});

const BookingModel = model<IBooking>("Booking", bookingSchema);
export default BookingModel;
