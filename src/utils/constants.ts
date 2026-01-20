export const DRIVER_RADIUS_KM = 0.1; // 100m

export const SOCKET_ROOMS = {
  ON_DUTY: "drivers:on_duty",
  AVAILABLE: "drivers:available", // Not currently on a trip
} as const;

export const SEARCH_CONFIG: Record<
  string,
  {
    initialRadiusKm: number;
    incrementKm: number;
    maxRadiusKm: number;
    intervalMs: number;
  }
> = {
  motorcycle: {
    initialRadiusKm: 15, // 0.3
    incrementKm: 1, //0.1
    maxRadiusKm: 30, //5
    intervalMs: 5_000,
  },

  sedan: {
    initialRadiusKm: 0.1,
    incrementKm: 0.2,
    maxRadiusKm: 6,
    intervalMs: 30_000,
  },

  mpv_suv: {
    initialRadiusKm: 0.1,
    incrementKm: 0.25,
    maxRadiusKm: 7,
    intervalMs: 30_000,
  },

  light_van: {
    initialRadiusKm: 0.1,
    incrementKm: 0.3,
    maxRadiusKm: 9,
    intervalMs: 30_000,
  },

  small_pickup: {
    initialRadiusKm: 0.1,
    incrementKm: 0.35,
    maxRadiusKm: 10,
    intervalMs: 30_000,
  },

  l300: {
    initialRadiusKm: 0.1,
    incrementKm: 0.4,
    maxRadiusKm: 12,
    intervalMs: 30_000,
  },

  closed_van: {
    initialRadiusKm: 0.1,
    incrementKm: 0.45,
    maxRadiusKm: 14,
    intervalMs: 30_000,
  },

  wing_van: {
    initialRadiusKm: 0.1,
    incrementKm: 0.5,
    maxRadiusKm: 16,
    intervalMs: 30_000,
  },
};
