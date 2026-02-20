import { RequestHandler } from "express";
import DriverModel from "../../models/Driver";
import { PreRegDriverModel } from "../../models/PreRegDriver";
import { generateJWT } from "../../utils/helpers/jwt";
import {
  checkPhoneRateLimit,
  normalizePHPhoneNumber,
  storeOTP,
  verifyStoredOTP,
} from "../../utils/helpers/phoneNumber";
import mongoose from "mongoose";
import axios from "axios";
import redisConnection from "../../config/redis";

// Semaphore configuration
const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY!;
const SEMAPHORE_OTP_URL = "https://semaphore.co/api/v4/otp";

export const sendOTP: RequestHandler = async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({
      error: "Phone number is required",
    });
  }

  const normalized = normalizePHPhoneNumber(phoneNumber);

  if (!normalized) {
    return res.status(400).json({
      error: "Invalid Philippine mobile number",
    });
  }

  // TODO: Send OTP

  res.status(200).json({
    success: true,
  });
};

// export const verifyOTP: RequestHandler = async (req, res) => {
//   const { phoneNumber, otpCode: otp } = req.body;

//   if (!phoneNumber || !otp) {
//     return res.status(400).json({
//       error: "Phone number and OTP are required",
//       success: false,
//     });
//   }

//   const normalizedNumber = normalizePHPhoneNumber(phoneNumber);

//   console.log(normalizedNumber);

//   if (!normalizedNumber) {
//     return res.status(400).json({
//       error: "Invalid Philippine mobile number",
//     });
//   }

//   const DUMMY_OTP = "123456";

//   if (otp !== DUMMY_OTP) {
//     return res.status(400).json({
//       error: "Invalid OTP, please try again",
//       success: false,
//     });
//   }

//   // Simple: check if driver exists
//   let driver = await DriverModel.findOne({
//     phoneNumber: normalizedNumber,
//   }).populate("vehicle", "key variants");
//   let status: "existing" | "pre-registered" | "new";

//   // If not, create with phone number only (check pre-reg if needed)
//   if (!driver) {
//     const preReg = await PreRegDriverModel.findOne({
//       phoneNumber: normalizedNumber,
//     });

//     status = preReg ? "pre-registered" : "new";

//     driver = await DriverModel.create({
//       phoneNumber: normalizedNumber,
//       ...(preReg && {
//         firstName: preReg.firstName,
//         lastName: preReg.lastName,
//         vehicle: new mongoose.Types.ObjectId(preReg.vehicle),
//         preRegId: preReg._id,
//       }),
//     });
//   } else {
//     status = "existing";
//   }

//   // Generate JWT for the driver
//   const token = generateJWT({
//     id: driver._id,
//     phoneNumber: driver.phoneNumber,
//     userType: "driver",
//   });

//   // Safely get vehicle key
//   const vehicleKey =
//     driver.vehicle &&
//     typeof driver.vehicle === "object" &&
//     "key" in driver.vehicle
//       ? (driver.vehicle as { key: string }).key
//       : null;

//   // Find the variant within the populated vehicle's variants array
//   let vehicleVariantLoad: number | null = null;
//   if (
//     driver.vehicleVariant &&
//     driver.vehicle &&
//     typeof driver.vehicle === "object" &&
//     "variants" in driver.vehicle
//   ) {
//     const vehicle = driver.vehicle as {
//       variants: Array<{ _id: mongoose.Types.ObjectId; maxLoadKg: number }>;
//     };
//     const variant = vehicle.variants.find(
//       (v) => v._id.toString() === driver.vehicleVariant?.toString(),
//     );
//     vehicleVariantLoad = variant?.maxLoadKg ?? null;
//   }

//   return res.status(200).json({
//     success: true,
//     status,
//     token,
//     driver: {
//       id: driver._id,
//       phoneNumber: driver.phoneNumber,
//       license: driver.licenseNumber,
//       profilePictureUrl: driver.profilePictureUrl,
//       vehicleImage: driver.images.frontView,
//       serviceAreas: driver.serviceAreas,
//       firstName: driver.firstName,
//       lastName: driver.lastName,
//       vehicle: vehicleVariantLoad
//         ? `${vehicleKey}_${vehicleVariantLoad}`
//         : vehicleKey,
//     },
//   });
// };

// export const sendOTP: RequestHandler = async (req, res) => {
//   const { phoneNumber } = req.body;

//   if (!phoneNumber) {
//     return res.status(400).json({
//       success: false,
//       error: "Phone number is required",
//     });
//   }

//   const normalized = normalizePHPhoneNumber(phoneNumber);

//   if (!normalized) {
//     return res.status(400).json({
//       success: false,
//       error: "Invalid Philippine mobile number",
//     });
//   }

//   const canSend = await checkPhoneRateLimit(normalized);
//   if (!canSend) {
//     return res.status(429).json({
//       success: false,
//       error:
//         "Too many OTP requests for this number. Please try again in a minute.",
//     });
//   }

//   try {
//     const response = await axios.post(
//       SEMAPHORE_OTP_URL,
//       new URLSearchParams({
//         apikey: SEMAPHORE_API_KEY,
//         number: normalized,
//         message:
//           "Your Fastmet verification code is {otp}. Valid for 10 minutes.",
//       }).toString(),
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       },
//     );

//     console.log("[Semaphore OTP] Sent to", normalized);
//     console.log("[Semaphore Response]", response.data);

//     const otpCode = response.data[0]?.code;

//     if (!otpCode) {
//       throw new Error("Semaphore did not return an OTP code");
//     }

//     await storeOTP(normalized, otpCode);

//     return res.status(200).json({
//       success: true,
//       message: "OTP sent successfully",
//     });
//   } catch (error: any) {
//     console.error("[Semaphore Error]", error.response?.data || error.message);

//     if (error.response) {
//       const errorMsg =
//         typeof error.response.data === "string"
//           ? error.response.data
//           : (error.response.data?.message ?? "");

//       if (errorMsg.includes("Invalid number")) {
//         return res.status(400).json({
//           success: false,
//           error: "Invalid phone number format",
//         });
//       }

//       if (errorMsg.includes("Insufficient balance")) {
//         return res.status(500).json({
//           success: false,
//           error: "Service temporarily unavailable. Please try again later.",
//         });
//       }
//     }

//     return res.status(500).json({
//       success: false,
//       error: "Failed to send OTP. Please try again.",
//     });
//   }
// };

export const verifyOTP: RequestHandler = async (req, res) => {
  const { phoneNumber, otpCode: otp } = req.body;

  if (!phoneNumber || !otp) {
    return res.status(400).json({
      success: false,
      error: "Phone number and OTP are required",
    });
  }

  const normalizedNumber = normalizePHPhoneNumber(phoneNumber);

  if (!normalizedNumber) {
    return res.status(400).json({
      success: false,
      error: "Invalid Philippine mobile number",
    });
  }

  try {
    const result = await verifyStoredOTP(normalizedNumber, otp);

    if (!result.success) {
      const messages: Record<string, string> = {
        expired: "OTP has expired. Please request a new one.",
        locked: "Too many failed attempts. Please request a new OTP.",
        invalid: "Invalid OTP. Please try again.",
      };

      return res.status(400).json({
        success: false,
        error: messages[result.reason ?? "invalid"],
      });
    }

    console.log("[OTP Verify] Success for", normalizedNumber);

    // ─────────────────────────────────────────
    // OTP VERIFIED — resolve driver record
    // ─────────────────────────────────────────

    let driver = await DriverModel.findOne({
      phoneNumber: normalizedNumber,
    }).populate("vehicle", "key variants");

    let status: "existing" | "pre-registered" | "new";

    if (!driver) {
      const preReg = await PreRegDriverModel.findOne({
        phoneNumber: normalizedNumber,
      });

      status = preReg ? "pre-registered" : "new";

      driver = await DriverModel.create({
        phoneNumber: normalizedNumber,
        ...(preReg && {
          firstName: preReg.firstName,
          lastName: preReg.lastName,
          vehicle: new mongoose.Types.ObjectId(preReg.vehicle),
          preRegId: preReg._id,
        }),
      });

      // Re-populate after creation so vehicle fields are available
      driver = await DriverModel.findById(driver._id).populate(
        "vehicle",
        "key variants",
      );
    } else {
      status = "existing";
    }

    if (!driver) {
      return res.status(500).json({
        success: false,
        error: "Failed to resolve driver record.",
      });
    }

    const token = generateJWT({
      id: driver._id,
      phoneNumber: driver.phoneNumber,
      userType: "driver",
    });

    // Safely extract vehicle key from populated vehicle
    const vehicleKey =
      driver.vehicle &&
      typeof driver.vehicle === "object" &&
      "key" in driver.vehicle
        ? (driver.vehicle as { key: string }).key
        : null;

    // Safely extract max load from matching variant
    let vehicleVariantLoad: number | null = null;
    if (
      driver.vehicleVariant &&
      driver.vehicle &&
      typeof driver.vehicle === "object" &&
      "variants" in driver.vehicle
    ) {
      const vehicle = driver.vehicle as {
        variants: Array<{ _id: mongoose.Types.ObjectId; maxLoadKg: number }>;
      };
      const variant = vehicle.variants.find(
        (v) => v._id.toString() === driver.vehicleVariant?.toString(),
      );
      vehicleVariantLoad = variant?.maxLoadKg ?? null;
    }

    return res.status(200).json({
      success: true,
      status,
      token,
      driver: {
        id: driver._id,
        phoneNumber: driver.phoneNumber,
        license: driver.licenseNumber,
        profilePictureUrl: driver.profilePictureUrl,
        vehicleImage: driver.images?.frontView ?? null,
        serviceAreas: driver.serviceAreas,
        firstName: driver.firstName,
        lastName: driver.lastName,
        vehicle: vehicleVariantLoad
          ? `${vehicleKey}_${vehicleVariantLoad}`
          : vehicleKey,
      },
    });
  } catch (error: any) {
    console.error("[OTP Verify Error]", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to verify OTP. Please try again.",
    });
  }
};
