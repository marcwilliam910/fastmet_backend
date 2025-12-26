import mongoose from "mongoose";

const FareSchema = new mongoose.Schema(
  {
    baseFare: {
      type: Number,
      required: true,
      default: 40, // initial default value
    },
    perKmRate: {
      type: Number,
      required: true,
      default: 15,
    },
    perMinRate: {
      type: Number,
      required: true,
      default: 2,
    },
  },
  {
    timestamps: true,
  }
);

const FareModel = mongoose.model("Fare", FareSchema);
export default FareModel;
