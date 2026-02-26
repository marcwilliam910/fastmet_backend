import { calculateDistance } from "./distanceCalculator";

type Coords = { lat: number; lng: number };

export type PoolingStop = {
  bookingId: string;
  type: "pickup" | "dropoff";
  label: string;
  coords: Coords;
  order: number;
  completed: boolean;
  completedAt: Date | null;
};

type InsertionResult = {
  stops: PoolingStop[];
  addedDistanceKm: number;
  pickupInsertedAt: number;
  dropoffInsertedAt: number;
};

/**
 * Finds the cheapest position to insert a new pickup+dropoff pair
 * into the list of remaining (uncompleted) stops.
 *
 * @param remainingStops - stops not yet completed, in current order
 * @param driverCoords   - driver's current location (acts as position "before" index 0)
 * @param newPickup      - new booking pickup stop (without order, completed fields)
 * @param newDropoff     - new booking dropoff stop (without order, completed fields)
 */
export const cheapestInsertion = (
  remainingStops: PoolingStop[],
  driverCoords: Coords,
  newPickup: Pick<PoolingStop, "bookingId" | "label" | "coords">,
  newDropoff: Pick<PoolingStop, "bookingId" | "label" | "coords">,
): InsertionResult => {
  // Build the full node list including driver as origin
  // nodes[0] = driver, nodes[1..n] = remainingStops
  const nodes: Coords[] = [
    driverCoords,
    ...remainingStops.map((s) => s.coords),
  ];

  let bestCost = Infinity;
  let bestPickupPos = 1; // insertion index in remainingStops (0-based)
  let bestDropoffPos = 2;

  // Try all valid (pickupPos, dropoffPos) combinations
  // pickupPos: where to insert pickup in remainingStops (0 = before first stop)
  // dropoffPos: where to insert dropoff, must be >= pickupPos + 1
  for (let pi = 0; pi <= remainingStops.length; pi++) {
    for (let di = pi + 1; di <= remainingStops.length + 1; di++) {
      const cost = calculateInsertionCost(
        nodes,
        pi,
        di,
        newPickup.coords,
        newDropoff.coords,
      );

      if (cost < bestCost) {
        bestCost = cost;
        bestPickupPos = pi;
        bestDropoffPos = di;
      }
    }
  }

  // Build the new stops array with pickup and dropoff inserted
  const updatedStops = buildUpdatedStops(
    remainingStops,
    newPickup,
    newDropoff,
    bestPickupPos,
    bestDropoffPos,
  );

  return {
    stops: updatedStops,
    addedDistanceKm: bestCost,
    pickupInsertedAt: bestPickupPos,
    dropoffInsertedAt: bestDropoffPos,
  };
};

/**
 * Calculates the extra distance cost of inserting pickup at pi
 * and dropoff at di into the current node sequence.
 */
const calculateInsertionCost = (
  nodes: Coords[], // [driver, ...currentStops]
  pi: number, // pickup insertion index (into remainingStops)
  di: number, // dropoff insertion index (into remainingStops)
  pickupCoords: Coords,
  dropoffCoords: Coords,
): number => {
  // We're working with remainingStops indices, but nodes[0] is driver
  // So remainingStop[i] = nodes[i+1]
  // Inserting at remainingStops position pi means between nodes[pi] and nodes[pi+1]

  const prevPickup = nodes[pi]; // node before pickup insertion
  const nextPickup = nodes[pi + 1]; // node after pickup insertion (undefined if at end)

  // Cost of inserting pickup between prevPickup and nextPickup
  let pickupCost: number;
  if (!nextPickup) {
    // Inserting at end — just cost to reach pickup from previous
    pickupCost = calculateDistance(prevPickup, pickupCoords);
  } else {
    pickupCost =
      calculateDistance(prevPickup, pickupCoords) +
      calculateDistance(pickupCoords, nextPickup) -
      calculateDistance(prevPickup, nextPickup);
  }

  // After inserting pickup, the sequence shifts by 1
  // So dropoff is now inserted between nodes[di] and nodes[di+1]
  // But if di > pi, we need to account for the shift
  const prevDropoff = di === pi + 1 ? pickupCoords : nodes[di];
  const nextDropoff = nodes[di + 1];

  // Cost of inserting dropoff
  let dropoffCost: number;
  if (!nextDropoff) {
    dropoffCost = calculateDistance(prevDropoff, dropoffCoords);
  } else {
    dropoffCost =
      calculateDistance(prevDropoff, dropoffCoords) +
      calculateDistance(dropoffCoords, nextDropoff) -
      calculateDistance(prevDropoff, nextDropoff);
  }

  return pickupCost + dropoffCost;
};

/**
 * Builds the final reordered stops array after insertion,
 * reassigning order values to reflect new sequence.
 */
const buildUpdatedStops = (
  remainingStops: PoolingStop[],
  newPickup: Pick<PoolingStop, "bookingId" | "label" | "coords">,
  newDropoff: Pick<PoolingStop, "bookingId" | "label" | "coords">,
  pickupPos: number,
  dropoffPos: number,
): PoolingStop[] => {
  const pickup: PoolingStop = {
    ...newPickup,
    type: "pickup",
    order: 0, // placeholder, reassigned below
    completed: false,
    completedAt: null,
  };

  const dropoff: PoolingStop = {
    ...newDropoff,
    type: "dropoff",
    order: 0, // placeholder, reassigned below
    completed: false,
    completedAt: null,
  };

  // Insert pickup first, then dropoff (dropoffPos already accounts for the shift)
  const withPickup = [
    ...remainingStops.slice(0, pickupPos),
    pickup,
    ...remainingStops.slice(pickupPos),
  ];

  const withBoth = [
    ...withPickup.slice(0, dropoffPos),
    dropoff,
    ...withPickup.slice(dropoffPos),
  ];

  // Reassign order values sequentially
  return withBoth.map((stop, index) => ({ ...stop, order: index }));
};

export const formatPoolingBooking = (booking: any) => {
  const { customerId, selectedVehicle, ...rest } = booking;
  return {
    ...rest,
    client: {
      id: customerId?._id,
      name: customerId?.fullName,
      profilePictureUrl: customerId?.profilePictureUrl,
      phoneNumber: customerId?.phoneNumber,
    },
    selectedVehicle: {
      freeServices: selectedVehicle?.vehicleTypeId?.freeServices || [],
    },
  };
};
