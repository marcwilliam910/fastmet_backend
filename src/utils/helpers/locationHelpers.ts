// utils/locationHelpers.ts
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

// City polygons (approximate boundaries for each city)
const CITY_POLYGONS: Record<
  string,
  Array<{ latitude: number; longitude: number }>
> = {
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

/**
 * Extract city from coordinates using polygon-based approach
 * More accurate than radius-based or text parsing approaches
 * @param coords - Latitude and longitude coordinates
 * @returns City name or null if not in Metro Manila
 */
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

  // Check which specific city the point is in
  for (const [city, polygon] of Object.entries(CITY_POLYGONS)) {
    if (isPointInPolygon(point, polygon)) {
      return city;
    }
  }

  return "Metro Manila";
};
