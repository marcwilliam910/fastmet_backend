import { ILoadVariant } from "../models/Vehicle";

export type RequestBooking = {
  customerId: string;
  bookingRef: string;
  pickUp: LocationDetails;
  dropOff: LocationDetails;
  bookingType: {
    type: "asap" | "pooling" | "schedule";
    value: string;
  };
  selectedVehicle: Partial<Omit<SelectedVehicle, "freeServices">> & {
    freeServices: Partial<Service>[];
  };
  routeData: RouteData;
  paymentMethod: "cash" | "gcash";
  addedServices: Partial<Service>[];
  photos: string[];
  note: string;
  itemType: string | null;
};

export type RouteData = {
  distance: number;
  duration: number;
  basePrice: number;
  distanceFee: number;
  serviceFee: number;
  totalPrice: number;
};

export type LocationDetails = {
  name: string;
  address: string;
  coords: { lat: number; lng: number };
  additionalDetails?: string;
};

export interface Service {
  key: string; // extra_helper, extra_waiting_time, special_help, etc.
  name: string; // Display name: "Extra Helper", "Extra Waiting Time"
  desc: string; // Description of what this service includes
  price: number; // Price in PHP (0 for free services)
  unit: string; // "per person", "per 15 minutes", "per service", etc.
  isQuantifiable: boolean; // true if user can request multiple (like extra helpers), false for one-time services
  maxQuantity?: number; // Optional: max quantity user can request (e.g., max 5 helpers)
  isActive: boolean;
  quantity: number; // number of units requested by user
}

export interface SelectedVehicle {
  key: string;
  name: string;
  imageUrl: string;
  freeServices: Service[];
  paidServices: Service[];
  variant: ILoadVariant;
}

export type RequestedDriver = {
  name: string;
  id: string;
  vehicleImage: string;
  totalBookings: number;
  profilePicture: string;
};
