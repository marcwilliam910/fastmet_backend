export const DRIVER_RADIUS_KM = 0.1; // 100m

export const SOCKET_ROOMS = {
  ON_DUTY: "drivers:on_duty",
  AVAILABLE: "drivers:available", // Not currently on a trip
} as const;
