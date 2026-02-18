import { Schema, Document, model } from "mongoose";
import { LocationDetails, Service } from "../types/booking";

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
    vehicleTypeId: Schema.Types.ObjectId;
    variantId: Schema.Types.ObjectId | null;
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
  driverRead: boolean;
  clientRead: boolean;
  // for searching drivers
  searchStep: number;
  currentRadiusKm: number;
  // driver notif scheduled booking
  // notificationSent: boolean;
  // notifiedAt: Date | null;
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
      city: { type: String, default: null },
      coords: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
      },
      additionalDetails: { type: String },
    },
    dropOff: {
      name: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, default: null },
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
      vehicleTypeId: {
        type: Schema.Types.ObjectId,
        required: true,
        ref: "VehicleType",
      },
      variantId: { type: Schema.Types.ObjectId },
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
    // notificationSent: {
    //   type: Boolean,
    //   default: false,
    // },
    // notifiedAt: {
    //   type: Date,
    //   default: null,
    // },
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
      _id: false,
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
    driverRead: {
      type: Boolean,
      default: false,
    },
    clientRead: {
      type: Boolean,
      default: false,
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
  { timestamps: true },
);

// Indexes for efficient querying
// 1. Client bookings pagination: customerId + status + createdAt (desc)
bookingSchema.index({ customerId: 1, status: 1, createdAt: -1 });

// 2. Client cancelled bookings: customerId + status + cancelledAt (desc)
bookingSchema.index({ customerId: 1, status: 1, cancelledAt: -1 });

// 3. Driver bookings: driverId + status + driverRead
bookingSchema.index({ driverId: 1, status: 1, driverRead: 1 });

// 4. Driver scheduled bookings with date filter: driverId + status + bookingType.value
bookingSchema.index({ driverId: 1, status: 1, "bookingType.value": 1 });

// 5. ASAP bookings search: status + bookingType.type + vehicleTypeId + variantId + createdAt (desc)
bookingSchema.index({
  status: 1,
  "bookingType.type": 1,
  "selectedVehicle.vehicleTypeId": 1,
  "selectedVehicle.variantId": 1,
  createdAt: -1,
});

// 6. Scheduled bookings search: status + bookingType.type + vehicleTypeId + variantId + bookingType.value
bookingSchema.index({
  status: 1,
  "bookingType.type": 1,
  "selectedVehicle.vehicleTypeId": 1,
  "selectedVehicle.variantId": 1,
  requestedDrivers: 1,
  "bookingType.value": 1,
  "pickUp.city": 1,
});

// 7. Requested drivers check: requestedDrivers array
// Note: bookingRef is already indexed automatically due to unique constraint
bookingSchema.index({ requestedDrivers: 1 });

// 8. Driver completed bookings aggregation: driverId + status + createdAt (desc)
bookingSchema.index({ driverId: 1, status: 1, createdAt: -1 });

const BookingModel = model<IBooking>("Booking", bookingSchema);
export default BookingModel;
