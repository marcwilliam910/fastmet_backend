import { isPointInPolygon } from "geolib";

export const METRO_MANILA_CITIES = [
  "Caloocan",
  "Las Piñas",
  "Makati",
  "Malabon",
  "Mandaluyong",
  "Manila",
  "Marikina",
  "Muntinlupa",
  "Navotas",
  "Parañaque",
  "Pasay",
  "Pasig",
  "Pateros",
  "Quezon City",
  "San Juan",
  "Taguig",
  "Valenzuela",
];

// Buffer distance in km to expand city polygons
const CITY_POLYGON_BUFFER_KM = 2;

// Approximate conversion: 1 degree latitude ≈ 111 km
// At latitude 14.5°N (Metro Manila): 1 degree longitude ≈ 107.5 km
const KM_PER_DEGREE_LAT = 111;
const KM_PER_DEGREE_LNG = 107.5; // cos(14.5°) * 111

type Coordinate = { latitude: number; longitude: number };

const expandPolygon = (
  polygon: Coordinate[],
  bufferKm: number,
): Coordinate[] => {
  // Calculate centroid
  const centroid = polygon.reduce(
    (acc, point) => ({
      latitude: acc.latitude + point.latitude / polygon.length,
      longitude: acc.longitude + point.longitude / polygon.length,
    }),
    { latitude: 0, longitude: 0 },
  );

  // Expand each vertex outward from centroid
  return polygon.map((point) => {
    // Calculate direction from centroid to point
    const deltaLat = point.latitude - centroid.latitude;
    const deltaLng = point.longitude - centroid.longitude;

    // Normalize the direction (accounting for different scales of lat/lng)
    const normalizedDeltaLat = deltaLat * KM_PER_DEGREE_LAT;
    const normalizedDeltaLng = deltaLng * KM_PER_DEGREE_LNG;
    const distance = Math.sqrt(
      normalizedDeltaLat * normalizedDeltaLat +
        normalizedDeltaLng * normalizedDeltaLng,
    );

    if (distance === 0) return point;

    // Calculate unit vector in km space
    const unitLat = normalizedDeltaLat / distance;
    const unitLng = normalizedDeltaLng / distance;

    // Move point outward by buffer distance, convert back to degrees
    return {
      latitude: point.latitude + (unitLat * bufferKm) / KM_PER_DEGREE_LAT,
      longitude: point.longitude + (unitLng * bufferKm) / KM_PER_DEGREE_LNG,
    };
  });
};

// Metro Manila boundary (matches your client-side polygon)
export const METRO_MANILA_POLYGON = [
  { latitude: 14.775, longitude: 120.93 },
  { latitude: 14.775, longitude: 120.95 },
  { latitude: 14.755, longitude: 120.975 },
  { latitude: 14.75, longitude: 121.025 },
  { latitude: 14.775, longitude: 121.05 },
  { latitude: 14.78, longitude: 121.08 },
  { latitude: 14.765, longitude: 121.11 },
  { latitude: 14.73, longitude: 121.13 },
  { latitude: 14.695, longitude: 121.15 },
  { latitude: 14.655, longitude: 121.165 },
  { latitude: 14.61, longitude: 121.17 },
  { latitude: 14.57, longitude: 121.175 },
  { latitude: 14.53, longitude: 121.175 },
  { latitude: 14.48, longitude: 121.125 },
  { latitude: 14.44, longitude: 121.085 },
  { latitude: 14.435, longitude: 121.02 },
  { latitude: 14.44, longitude: 120.975 },
  { latitude: 14.44, longitude: 120.945 },
  { latitude: 14.475, longitude: 120.94 },
  { latitude: 14.505, longitude: 120.96 },
  { latitude: 14.54, longitude: 120.96 },
  { latitude: 14.565, longitude: 120.965 },
  { latitude: 14.585, longitude: 120.965 },
  { latitude: 14.605, longitude: 120.96 },
  { latitude: 14.62, longitude: 120.955 },
  { latitude: 14.64, longitude: 120.95 },
  { latitude: 14.68, longitude: 120.935 },
  { latitude: 14.715, longitude: 120.93 },
  { latitude: 14.775, longitude: 120.93 },
];

// Base city polygons (before buffer expansion)
const BASE_CITY_POLYGONS: Record<string, Coordinate[]> = {
  Manila: [
    { latitude: 14.565, longitude: 120.97 },
    { latitude: 14.625, longitude: 120.97 },
    { latitude: 14.625, longitude: 121.01 },
    { latitude: 14.58, longitude: 121.01 },
    { latitude: 14.565, longitude: 120.98 },
    { latitude: 14.565, longitude: 120.97 },
  ],
  Makati: [
    { latitude: 14.52, longitude: 121.0 },
    { latitude: 14.575, longitude: 121.0 },
    { latitude: 14.58, longitude: 121.05 },
    { latitude: 14.54, longitude: 121.055 },
    { latitude: 14.52, longitude: 121.04 },
    { latitude: 14.52, longitude: 121.0 },
  ],
  Pasig: [
    { latitude: 14.55, longitude: 121.055 },
    { latitude: 14.61, longitude: 121.055 },
    { latitude: 14.615, longitude: 121.12 },
    { latitude: 14.56, longitude: 121.12 },
    { latitude: 14.55, longitude: 121.055 },
  ],
  "Quezon City": [
    { latitude: 14.58, longitude: 121.0 },
    { latitude: 14.76, longitude: 121.0 },
    { latitude: 14.77, longitude: 121.09 },
    { latitude: 14.68, longitude: 121.12 },
    { latitude: 14.61, longitude: 121.09 },
    { latitude: 14.58, longitude: 121.05 },
    { latitude: 14.58, longitude: 121.0 },
  ],
  Taguig: [
    { latitude: 14.49, longitude: 121.03 },
    { latitude: 14.555, longitude: 121.03 },
    { latitude: 14.565, longitude: 121.09 },
    { latitude: 14.52, longitude: 121.12 },
    { latitude: 14.49, longitude: 121.09 },
    { latitude: 14.49, longitude: 121.03 },
  ],
  Mandaluyong: [
    { latitude: 14.57, longitude: 121.02 },
    { latitude: 14.595, longitude: 121.02 },
    { latitude: 14.595, longitude: 121.055 },
    { latitude: 14.57, longitude: 121.055 },
    { latitude: 14.57, longitude: 121.02 },
  ],
  "San Juan": [
    { latitude: 14.595, longitude: 121.02 },
    { latitude: 14.615, longitude: 121.02 },
    { latitude: 14.615, longitude: 121.055 },
    { latitude: 14.595, longitude: 121.055 },
    { latitude: 14.595, longitude: 121.02 },
  ],
  Marikina: [
    { latitude: 14.62, longitude: 121.09 },
    { latitude: 14.69, longitude: 121.09 },
    { latitude: 14.71, longitude: 121.14 },
    { latitude: 14.64, longitude: 121.145 },
    { latitude: 14.62, longitude: 121.09 },
  ],
  Caloocan: [
    { latitude: 14.64, longitude: 120.96 },
    { latitude: 14.73, longitude: 120.96 },
    { latitude: 14.745, longitude: 121.02 },
    { latitude: 14.66, longitude: 121.025 },
    { latitude: 14.64, longitude: 120.96 },
  ],
  Malabon: [
    { latitude: 14.65, longitude: 120.93 },
    { latitude: 14.68, longitude: 120.93 },
    { latitude: 14.68, longitude: 120.97 },
    { latitude: 14.65, longitude: 120.97 },
    { latitude: 14.65, longitude: 120.93 },
  ],
  Navotas: [
    { latitude: 14.64, longitude: 120.91 },
    { latitude: 14.67, longitude: 120.91 },
    { latitude: 14.67, longitude: 120.95 },
    { latitude: 14.64, longitude: 120.95 },
    { latitude: 14.64, longitude: 120.91 },
  ],
  Valenzuela: [
    { latitude: 14.68, longitude: 120.96 },
    { latitude: 14.74, longitude: 120.96 },
    { latitude: 14.76, longitude: 121.02 },
    { latitude: 14.7, longitude: 121.025 },
    { latitude: 14.68, longitude: 120.96 },
  ],
  Parañaque: [
    { latitude: 14.465, longitude: 120.975 },
    { latitude: 14.51, longitude: 120.975 },
    { latitude: 14.52, longitude: 121.03 },
    { latitude: 14.47, longitude: 121.035 },
    { latitude: 14.465, longitude: 120.975 },
  ],
  "Las Piñas": [
    { latitude: 14.43, longitude: 120.965 },
    { latitude: 14.47, longitude: 120.965 },
    { latitude: 14.47, longitude: 121.01 },
    { latitude: 14.43, longitude: 121.01 },
    { latitude: 14.43, longitude: 120.965 },
  ],
  Muntinlupa: [
    { latitude: 14.37, longitude: 121.01 },
    { latitude: 14.45, longitude: 121.01 },
    { latitude: 14.47, longitude: 121.07 },
    { latitude: 14.42, longitude: 121.09 },
    { latitude: 14.37, longitude: 121.055 },
    { latitude: 14.37, longitude: 121.01 },
  ],
  Pasay: [
    { latitude: 14.52, longitude: 120.98 },
    { latitude: 14.56, longitude: 120.98 },
    { latitude: 14.56, longitude: 121.02 },
    { latitude: 14.52, longitude: 121.02 },
    { latitude: 14.52, longitude: 120.98 },
  ],
  Pateros: [
    { latitude: 14.535, longitude: 121.06 },
    { latitude: 14.555, longitude: 121.06 },
    { latitude: 14.555, longitude: 121.085 },
    { latitude: 14.535, longitude: 121.085 },
    { latitude: 14.535, longitude: 121.06 },
  ],
};

const CITY_POLYGONS: Record<string, Coordinate[]> = Object.fromEntries(
  Object.entries(BASE_CITY_POLYGONS).map(([city, polygon]) => [
    city,
    expandPolygon(polygon, CITY_POLYGON_BUFFER_KM),
  ]),
);

// Helper to calculate distance from point to polygon centroid
const getDistanceToPolygonCenter = (
  point: Coordinate,
  polygon: Coordinate[],
): number => {
  const centroid = polygon.reduce(
    (acc, p) => ({
      latitude: acc.latitude + p.latitude / polygon.length,
      longitude: acc.longitude + p.longitude / polygon.length,
    }),
    { latitude: 0, longitude: 0 },
  );

  const latDiff = (point.latitude - centroid.latitude) * KM_PER_DEGREE_LAT;
  const lngDiff = (point.longitude - centroid.longitude) * KM_PER_DEGREE_LNG;

  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
};

export const extractCityFromCoords = (coords: {
  lat: number;
  lng: number;
}): string | null => {
  if (
    !coords ||
    typeof coords.lat !== "number" ||
    typeof coords.lng !== "number"
  ) {
    return null;
  }

  const point = { latitude: coords.lat, longitude: coords.lng };

  // First check if point is in Metro Manila at all
  if (!isPointInPolygon(point, METRO_MANILA_POLYGON)) {
    return null;
  }

  // STEP 1: Try BASE polygons first (most accurate, no buffer)
  for (const [city, polygon] of Object.entries(BASE_CITY_POLYGONS)) {
    if (isPointInPolygon(point, polygon)) {
      console.log(`✅ Exact match in ${city} (base polygon)`);
      return city;
    }
  }

  // STEP 2: Point not in any base polygon, try expanded polygons (edge cases)
  const matchingCities: Array<{ city: string; distance: number }> = [];

  for (const [city, polygon] of Object.entries(CITY_POLYGONS)) {
    if (isPointInPolygon(point, polygon)) {
      const distance = getDistanceToPolygonCenter(
        point,
        BASE_CITY_POLYGONS[city],
      );
      matchingCities.push({ city, distance });
    }
  }

  // STEP 3: If multiple matches, pick the closest city by centroid distance
  if (matchingCities.length > 0) {
    matchingCities.sort((a, b) => a.distance - b.distance);
    const closestCity = matchingCities[0].city;

    if (matchingCities.length > 1) {
      console.log(
        `⚠️ Multiple city matches (${matchingCities.map((m) => m.city).join(", ")}), ` +
          `choosing closest: ${closestCity}`,
      );
    } else {
      console.log(`✅ Match in ${closestCity} (expanded polygon, edge case)`);
    }

    return closestCity;
  }

  // STEP 4: Last resort - couldn't identify specific city (very rare)
  console.log(
    `⚠️ Could not identify specific city for coords (${coords.lat}, ${coords.lng}), returning "Metro Manila"`,
  );
  return "Metro Manila";
};

// /**
//  * 🔧 FIXED: Determines if driver services the pickup city
//  * Logic:
//  * 1. Driver explicitly serves this specific city → TRUE
//  * 2. Driver has "Metro Manila" (serves ALL cities) → TRUE
//  * 3. Pickup is "Metro Manila" (unknown city) → TRUE only if driver has "Metro Manila"
//  *    (This should be VERY RARE since extractCityFromCoords is now more accurate)
//  */
// export const isDriverServicingCity = (
//   driverServiceAreas: string[],
//   pickupCity: string,
// ): boolean => {
//   if (!driverServiceAreas || !pickupCity) return false;

//   // Driver serves this specific city
//   if (driverServiceAreas.includes(pickupCity)) return true;

//   // Driver has "Metro Manila" catch-all (serves all cities)
//   if (driverServiceAreas.includes("Metro Manila")) return true;

//   // 🔧 FIXED: If pickup city is "Metro Manila" (couldn't identify specific city),
//   // ONLY match drivers who explicitly selected "Metro Manila"
//   // DO NOT match drivers with any individual city
//   // This ensures the rare case of unknown city only shows to drivers serving all of Metro Manila
//   if (pickupCity === "Metro Manila") {
//     // Driver must have "Metro Manila" in serviceAreas (already checked above, so this is redundant)
//     // If we reach here, driver doesn't have "Metro Manila", so return false
//     return false;
//   }

//   return false;
// };
