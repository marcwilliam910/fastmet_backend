import { Schema, Document, model } from "mongoose";
import { LocationDetails, Service } from "../types/booking";

interface SelectedVehicle {
  key: string;
  name: string;
  imageUrl: string;
  freeServices: Service[];
}

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
  selectedVehicle: SelectedVehicle;
  routeData: {
    distance: number;
    duration: number;
    basePrice: number;
    distanceFee: number;
    serviceFee: number;
    totalPrice: number;
  };
  paymentMethod: string; // "cash" | "online"
  addedServices: Service[];
  status:
    | "pending"
    | "searching"
    | "scheduled"
    | "active"
    | "completed"
    | "cancelled";
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  notificationSent: boolean;
  notifiedAt: Date | null;
  bookingImages: {
    pickup: {
      beforeImageUrl: string | null;
      afterImageUrl: string | null;
    };
    dropoff: {
      receiptImageUrl: string | null;
      packageImageUrl: string | null;
    };
  };
  note: string;
  itemType: string | null;
  photos: string[];
  driverRating: number | null;
  requestedDrivers: Schema.Types.ObjectId[];
  cancelledAt: Date | null;
  // for searching drivers
  searchStep: number;
  currentRadiusKm: number;
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
      key: {
        type: String,
        required: true,
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
      freeServices: [
        {
          type: {
            key: { type: String, required: true },
            name: { type: String, required: true },
            price: { type: Number, required: true },
            quantity: { type: Number },
            _id: false,
          },
        },
      ],
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
        key: { type: String, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number },
        _id: false,
      },
    ],
    status: {
      type: String,
      required: true,
      default: "pending",
      enum: [
        "pending",
        "searching",
        "scheduled",
        "active",
        "completed",
        "cancelled",
      ],
    },
    completedAt: { type: Date, default: null },
    notificationSent: {
      type: Boolean,
      default: false,
    },
    notifiedAt: {
      type: Date,
      default: null,
    },
    bookingImages: {
      type: {
        pickup: {
          beforeImageUrl: {
            type: String,
            default: null,
          },
          afterImageUrl: {
            type: String,
            default: null,
          },
        },
        dropoff: {
          receiptImageUrl: {
            type: String,
            default: null,
          },
          packageImageUrl: {
            type: String,
            default: null,
          },
        },
      },
      default: {
        pickup: {
          beforeImageUrl: null,
          afterImageUrl: null,
        },
        dropoff: {
          receiptImageUrl: null,
          packageImageUrl: null,
        },
      },
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
    requestedDrivers: [
      {
        type: Schema.Types.ObjectId,
        ref: "Driver",
      },
    ],
    cancelledAt: {
      type: Date,
      default: null,
    },
    searchStep: {
      type: Number,
      default: 0,
    },

    currentRadiusKm: {
      type: Number,
      default: 0.1, // 100 meters
    },
  },
  { timestamps: true }
);

// Create index for efficient queries
bookingSchema.index({
  status: 1,
  requestedDrivers: 1,
  "bookingType.value": 1,
  notificationSent: 1,
  driverId: 1,
});

const BookingModel = model<IBooking>("Booking", bookingSchema);
export default BookingModel;
