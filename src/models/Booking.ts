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
  driver: {
    id: {
      type: Schema.Types.ObjectId;
      ref: "Driver";
    };
    name: string;
    rating: number;
  } | null;
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
}

const bookingSchema: Schema = new Schema<IBooking>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    bookingRef: { type: String, required: true, unique: true },
    driver: {
      type: new Schema(
        {
          id: { type: Schema.Types.ObjectId, ref: "Driver" },
          name: { type: String },
          rating: { type: Number },
        },
        { _id: false } // this prevents Mongoose from adding a default _id
      ),
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
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        icon: { type: String },
      },
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
  },
  { timestamps: true }
);

// Create index for efficient queries
bookingSchema.index({
  status: 1,
  "bookingType.value": 1,
  notificationSent: 1,
  "driver.id": 1,
});

const BookingModel = model<IBooking>("Booking", bookingSchema);
export default BookingModel;
