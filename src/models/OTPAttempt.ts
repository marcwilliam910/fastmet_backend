import mongoose from "mongoose";

interface IOTPAttempt {
  phoneNumber: string;
  sendAttempts: number;
  lastSendAttempt: Date;
  blockedUntil?: Date;
  verifyAttempts: number;
  lastVerifyAttempt?: Date;
  verifyBlockedUntil?: Date;
}

const otpAttemptSchema = new mongoose.Schema<IOTPAttempt>(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sendAttempts: {
      type: Number,
      default: 0,
    },
    lastSendAttempt: {
      type: Date,
      default: Date.now,
    },
    blockedUntil: {
      type: Date,
    },
    verifyAttempts: {
      type: Number,
      default: 0,
    },
    lastVerifyAttempt: {
      type: Date,
    },
    verifyBlockedUntil: {
      type: Date,
    },
  },
  {
    timestamps: true, // Auto-adds createdAt & updatedAt
  }
);

// TTL index - auto-delete documents after 24 hours
otpAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export const OTPAttemptModel = mongoose.model<IOTPAttempt>(
  "OTPAttempt",
  otpAttemptSchema
);
