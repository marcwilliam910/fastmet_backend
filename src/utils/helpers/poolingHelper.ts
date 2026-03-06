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
  addedDurationMinutes: number;
  pickupInsertedAt: number;
  dropoffInsertedAt: number;
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

export const cheapestInsertionMidTrip = (
  remainingStops: PoolingStop[],
  driverCoords: Coords,
  newPickup: Pick<PoolingStop, "bookingId" | "label" | "coords">,
  newDropoff: Pick<PoolingStop, "bookingId" | "label" | "coords">,
): InsertionResult => {
  // nodes: [driver, ...remainingStops]
  const nodes: Coords[] = [
    driverCoords,
    ...remainingStops.map((s) => s.coords),
  ];

  let bestCost = Infinity;
  let bestPickupPos = 0;
  let bestDropoffPos = 1;

  // Try all valid (pickupPos, dropoffPos) combinations
  // pickupPos: 0 = after driver, 1 = after first stop, etc.
  // dropoffPos must be > pickupPos
  for (let pi = 0; pi <= remainingStops.length; pi++) {
    // Cost of inserting pickup between nodes[pi] and nodes[pi+1]
    const prevPickup = nodes[pi];
    const nextPickup = nodes[pi + 1];

    let pickupCost: number;
    if (!nextPickup) {
      pickupCost = calculateDistance(prevPickup, newPickup.coords);
    } else {
      pickupCost =
        calculateDistance(prevPickup, newPickup.coords) +
        calculateDistance(newPickup.coords, nextPickup) -
        calculateDistance(prevPickup, nextPickup);
    }

    // Try all dropoff positions after pickup
    for (let di = pi + 1; di <= remainingStops.length + 1; di++) {
      // After pickup inserted at pi, nodes shift by 1 for positions > pi
      const prevDropoff = di === pi + 1 ? newPickup.coords : nodes[di - 1];
      const nextDropoff = nodes[di];

      let dropoffCost: number;
      if (!nextDropoff) {
        dropoffCost = calculateDistance(prevDropoff, newDropoff.coords);
      } else {
        dropoffCost =
          calculateDistance(prevDropoff, newDropoff.coords) +
          calculateDistance(newDropoff.coords, nextDropoff) -
          calculateDistance(prevDropoff, nextDropoff);
      }

      const totalCost = pickupCost + dropoffCost;
      if (totalCost < bestCost) {
        bestCost = totalCost;
        bestPickupPos = pi;
        bestDropoffPos = di;
      }
    }
  }

  // Build final stops array
  const pickup: PoolingStop = {
    ...newPickup,
    type: "pickup",
    order: 0,
    completed: false,
    completedAt: null,
  };

  const dropoff: PoolingStop = {
    ...newDropoff,
    type: "dropoff",
    order: 0,
    completed: false,
    completedAt: null,
  };

  const withPickup = [
    ...remainingStops.slice(0, bestPickupPos),
    pickup,
    ...remainingStops.slice(bestPickupPos),
  ];

  const withBoth = [
    ...withPickup.slice(0, bestDropoffPos),
    dropoff,
    ...withPickup.slice(bestDropoffPos),
  ];

  const finalStops = withBoth.map((stop, index) => ({ ...stop, order: index }));

  const ROAD_FACTOR = 1.35;
  const AVG_SPEED_KMH = 40;
  const addedDistanceKm = bestCost * ROAD_FACTOR;
  const addedDurationMinutes = (addedDistanceKm / AVG_SPEED_KMH) * 60;

  return {
    stops: finalStops,
    addedDistanceKm,
    addedDurationMinutes,
    pickupInsertedAt: bestPickupPos,
    dropoffInsertedAt: bestDropoffPos,
  };
};

export type OptimizedStop = {
  bookingId: string;
  label: string;
  type: "pickup" | "dropoff";
  coords: { lat: number; lng: number };
  order: number;
  completed: boolean;
  completedAt: Date | null;
};

type OptimizedMidTripResult = {
  stops: OptimizedStop[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
};

export const mapboxOptimizedMidTrip = async (
  driverCoords: { lat: number; lng: number },
  remainingStops: OptimizedStop[],
  newPickup: Pick<OptimizedStop, "bookingId" | "label" | "coords">,
  newDropoff: Pick<OptimizedStop, "bookingId" | "label" | "coords">,
): Promise<OptimizedMidTripResult> => {
  const n = remainingStops.length;
  const totalInputs = n + 4; // driver×2 + remaining + newPickup + newDropoff

  // Layout: [0]=driver, [1..n]=remaining, [n+1]=newPickup, [n+2]=newDropoff, [n+3]=driver
  const coordinates = [
    `${driverCoords.lng},${driverCoords.lat}`,
    ...remainingStops.map((s) => `${s.coords.lng},${s.coords.lat}`),
    `${newPickup.coords.lng},${newPickup.coords.lat}`,
    `${newDropoff.coords.lng},${newDropoff.coords.lat}`,
    `${driverCoords.lng},${driverCoords.lat}`, // ← driver at end for roundtrip
  ].join(";");

  // Build distributions — each pickup must come before its dropoff
  const distributions: string[] = [];

  for (let i = 0; i < remainingStops.length; i++) {
    const stop = remainingStops[i];
    if (stop.type === "pickup") {
      const dropoffIdx = remainingStops.findIndex(
        (s, j) =>
          j > i && s.bookingId === stop.bookingId && s.type === "dropoff",
      );
      if (dropoffIdx !== -1) {
        distributions.push(`${i + 1},${dropoffIdx + 1}`);
      }
    }
  }

  // New booking: pickup at n+1, dropoff at n+2
  distributions.push(`${n + 1},${n + 2}`);

  const url = `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${coordinates}?distributions=${distributions.join(";")}&overview=false&roundtrip=true&access_token=${process.env.MAPBOX_SECRET_KEY}`;

  const res = await fetch(url);
  const json = await res.json();

  if (!json.trips?.[0] || !json.waypoints) {
    throw new Error(`Mapbox optimization failed: ${JSON.stringify(json)}`);
  }

  // allStops[i] corresponds to coordinate input index i+1 (driver is 0)
  const allStops: OptimizedStop[] = [
    ...remainingStops,
    {
      ...newPickup,
      type: "pickup" as const,
      order: 0,
      completed: false,
      completedAt: null,
    },
    {
      ...newDropoff,
      type: "dropoff" as const,
      order: 0,
      completed: false,
      completedAt: null,
    },
  ];

  // Skip first (driver start) and last (driver end) waypoints
  const orderedStops: OptimizedStop[] = (
    json.waypoints as { waypoint_index: number }[]
  )
    .map((wp, inputIndex) => ({ visitOrder: wp.waypoint_index, inputIndex }))
    .filter(({ inputIndex }) => inputIndex > 0 && inputIndex < totalInputs - 1)
    .sort((a, b) => a.visitOrder - b.visitOrder)
    .map(({ inputIndex }, sortedIndex) => ({
      ...allStops[inputIndex - 1],
      order: sortedIndex,
    }));

  return {
    stops: orderedStops,
    totalDistanceKm: json.trips[0].distance / 1000,
    totalDurationMinutes: json.trips[0].duration / 60,
  };
};
