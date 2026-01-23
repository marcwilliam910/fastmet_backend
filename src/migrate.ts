import {VehicleType} from "./models/Vehicle";

const SEARCH_CONFIG_MIGRATION = {
  motorcycle: {
    initialRadiusKm: 15,
    incrementKm: 1,
    maxRadiusKm: 30,
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

export async function migrateSearchConfig() {
  for (const [key, searchConfig] of Object.entries(SEARCH_CONFIG_MIGRATION)) {
    await VehicleType.findOneAndUpdate(
      {key},
      {$set: {searchConfig}},
      {upsert: false},
    );
    console.log(`✅ Updated search config for ${key}`);
  }
}

// Run: migrateSearchConfig();
