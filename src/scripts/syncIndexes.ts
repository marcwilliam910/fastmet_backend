import mongoose from "mongoose";
import dotenv from "dotenv";

// Import all models to ensure they're registered
import BookingModel from "../models/Booking";
import UserModel from "../models/User";
import DriverModel from "../models/Driver";
import ConversationModel from "../models/Conversation";
import MessageModel from "../models/Message";
import { PreRegDriverModel } from "../models/PreRegDriver";
import { VehicleType } from "../models/Vehicle";
import FareModel from "../models/Fare";
import { OTPAttemptModel } from "../models/OTPAttempt";

dotenv.config();

/**
 * Syncs all indexes in MongoDB to match the current model definitions.
 * This will:
 * - Create missing indexes
 * - Drop indexes that are no longer defined in models
 * - Keep indexes that match model definitions
 */
async function syncIndexes() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log("✅ Connected to MongoDB\n");

    const models = [
      { name: "Booking", model: BookingModel },
      { name: "User", model: UserModel },
      { name: "Driver", model: DriverModel },
      { name: "Conversation", model: ConversationModel },
      { name: "Message", model: MessageModel },
      { name: "Pre_Reg_Driver", model: PreRegDriverModel },
      { name: "VehicleType", model: VehicleType },
      { name: "Fare", model: FareModel },
      { name: "OTPAttempt", model: OTPAttemptModel },
    ];

    console.log("🔄 Starting index synchronization...\n");

    for (const { name, model } of models) {
      try {
        console.log(`📋 Syncing indexes for: ${name}`);
        
        // syncIndexes() returns an array of dropped index names
        // New indexes are created automatically, only dropped ones are returned
        const droppedIndexes = await model.syncIndexes();
        
        if (Array.isArray(droppedIndexes) && droppedIndexes.length > 0) {
          console.log(`  ❌ Dropped ${droppedIndexes.length} old index(es):`, droppedIndexes);
        } else {
          console.log(`  ✓ Indexes are already in sync`);
        }
        
        console.log("");
      } catch (error) {
        console.error(`  ❌ Error syncing indexes for ${name}:`, error);
      }
    }

    console.log("✅ Index synchronization completed!");
    console.log("\n📊 Summary:");
    console.log("All indexes have been synced with your model definitions.");
    console.log("Old indexes that are no longer in your models have been removed.");
    console.log("New indexes from your models have been created.");

    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the sync
syncIndexes();
