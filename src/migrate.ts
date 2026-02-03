import {VehicleType} from "./models/Vehicle";
import BookingModel from "./models/Booking";

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

/**
 * Sync indexes for Booking collection
 * This will drop indexes that are no longer in the schema and create new ones
 */
export async function syncBookingIndexes() {
  console.log("🔄 Syncing Booking indexes...");

  try {
    // Get current indexes
    const currentIndexes = await BookingModel.collection.indexes();
    console.log(`📋 Current indexes: ${currentIndexes.length}`);
    currentIndexes.forEach((idx) => {
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Drop all non-_id indexes
    const indexesToDrop = currentIndexes
      .filter((idx) => idx.name && idx.name !== "_id_")
      .map((idx) => idx.name as string);

    for (const indexName of indexesToDrop) {
      try {
        await BookingModel.collection.dropIndex(indexName);
        console.log(`🗑️  Dropped index: ${indexName}`);
      } catch (err: any) {
        console.log(`⚠️  Could not drop index ${indexName}: ${err.message}`);
      }
    }

    // Recreate indexes from schema
    await BookingModel.syncIndexes();
    console.log("✅ Indexes synced successfully");

    // Show new indexes
    const newIndexes = await BookingModel.collection.indexes();
    console.log(`📋 New indexes: ${newIndexes.length}`);
    newIndexes.forEach((idx) => {
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
  } catch (error) {
    console.error("❌ Error syncing indexes:", error);
    throw error;
  }
}

// Run: syncBookingIndexes();
