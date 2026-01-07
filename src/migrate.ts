import { VehicleType } from "./models/Vehicle";

export async function migrateVehicleTypes() {
  console.log("🚚 Migrating vehicle pricing with extended descriptions...");

  const vehicles = [
    // Closed Van
    {
      key: "closed_van",
      name: "Closed Van",
      desc: "Fully enclosed van designed for large and heavy deliveries. Provides maximum protection from weather and theft, making it ideal for commercial and bulk transport within Metro Manila.",
      imageUrl:
        "https://res.cloudinary.com/dlkpjr03s/image/upload/v1767752761/closed_van_jkusqp.png",
      variants: [
        {
          maxLoadKg: 2000,
          baseFare: 1600,
          pricingTiers: [
            { minKm: 0, maxKm: 10, pricePerKm: 42 },
            { minKm: 10, maxKm: 20, pricePerKm: 30 },
            { minKm: 20, pricePerKm: 22 },
          ],
        },
        {
          maxLoadKg: 3000,
          baseFare: 2200,
          pricingTiers: [
            { minKm: 0, maxKm: 10, pricePerKm: 45 },
            { minKm: 10, maxKm: 20, pricePerKm: 32 },
            { minKm: 20, pricePerKm: 24 },
          ],
        },
        {
          maxLoadKg: 4000,
          baseFare: 2700,
          pricingTiers: [
            { minKm: 0, maxKm: 10, pricePerKm: 48 },
            { minKm: 10, maxKm: 20, pricePerKm: 35 },
            { minKm: 20, pricePerKm: 26 },
          ],
        },
        {
          maxLoadKg: 5000,
          baseFare: 3200,
          pricingTiers: [
            { minKm: 0, maxKm: 10, pricePerKm: 52 },
            { minKm: 10, maxKm: 20, pricePerKm: 38 },
            { minKm: 20, pricePerKm: 28 },
          ],
        },
      ],
    },

    // Wing Van
    {
      key: "wing_van",
      name: "Wing Van",
      desc: "Heavy-duty wing van for large-scale logistics and industrial transport. Features side-opening panels for efficient loading and unloading of oversized or palletized cargo.",
      imageUrl:
        "https://res.cloudinary.com/dlkpjr03s/image/upload/v1767752762/wing_van_mc3ysy.png",
      variants: [
        {
          maxLoadKg: 2000,
          baseFare: 4500,
          pricingTiers: [
            { minKm: 0, maxKm: 20, pricePerKm: 85 },
            { minKm: 20, maxKm: 40, pricePerKm: 70 },
            { minKm: 40, pricePerKm: 60 },
          ],
        },
        {
          maxLoadKg: 3000,
          baseFare: 5500,
          pricingTiers: [
            { minKm: 0, maxKm: 20, pricePerKm: 90 },
            { minKm: 20, maxKm: 40, pricePerKm: 75 },
            { minKm: 40, pricePerKm: 65 },
          ],
        },
        {
          maxLoadKg: 4000,
          baseFare: 6500,
          pricingTiers: [
            { minKm: 0, maxKm: 20, pricePerKm: 95 },
            { minKm: 20, maxKm: 40, pricePerKm: 80 },
            { minKm: 40, pricePerKm: 70 },
          ],
        },
        {
          maxLoadKg: 5000,
          baseFare: 7500,
          pricingTiers: [
            { minKm: 0, maxKm: 20, pricePerKm: 100 },
            { minKm: 20, maxKm: 40, pricePerKm: 85 },
            { minKm: 40, pricePerKm: 75 },
          ],
        },
      ],
    },
  ];

  for (const vehicle of vehicles) {
    await VehicleType.updateOne(
      { key: vehicle.key },
      { $set: vehicle },
      { upsert: true }
    );
  }

  console.log("✅ Vehicle pricing & extended descriptions migration complete");
}
