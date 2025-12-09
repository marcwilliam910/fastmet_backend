import { Schema, Document, model } from "mongoose";

export interface IBooking extends Document {
  userId: string;
  bookingRef: string;
  driver: {
    id: {
      type: Schema.Types.ObjectId;
      ref: "Driver";
    };
    name: string;
    rating: number;
  } | null;
  pickUp: {
    name: string;
    address: string;
    coords: {
      lat: number;
      lng: number;
    };
  };
  dropOff: {
    name: string;
    address: string;
    coords: {
      lat: number;
      lng: number;
    };
  };
  bookingType: {
    type: string; // "asap" | "schedule"
    value: string | Date | null;
  };
  selectedVehicle: {
    id: string;
    name: string;
    capacity: string;
  };
  routeData: {
    distance: number;
    duration: number;
    price: number;
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
}

const bookingSchema: Schema = new Schema<IBooking>(
  {
    userId: { type: String, required: true },
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
    },
    dropOff: {
      name: { type: String, required: true },
      address: { type: String, required: true },
      coords: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
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
      price: { type: Number, required: true },
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
  },
  { timestamps: true }
);

const BookingModel = model<IBooking>("Booking", bookingSchema);
export default BookingModel;
