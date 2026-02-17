import { RequestHandler } from "express";
import DriverModel from "../../models/Driver";
import { PreRegDriverModel } from "../../models/PreRegDriver";
import { generateJWT } from "../../utils/helpers/jwt";
import { normalizePHPhoneNumber } from "../../utils/helpers/phoneNumber";
import mongoose from "mongoose";

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

export const verifyOTP: RequestHandler = async (req, res) => {
  const { phoneNumber, otpCode: otp } = req.body;

  if (!phoneNumber || !otp) {
    return res.status(400).json({
      error: "Phone number and OTP are required",
      success: false,
    });
  }

  const normalizedNumber = normalizePHPhoneNumber(phoneNumber);

  console.log(normalizedNumber);

  if (!normalizedNumber) {
    return res.status(400).json({
      error: "Invalid Philippine mobile number",
    });
  }

  const DUMMY_OTP = "123456";

  if (otp !== DUMMY_OTP) {
    return res.status(400).json({
      error: "Invalid OTP, please try again",
      success: false,
    });
  }

  // Simple: check if driver exists
  let driver = await DriverModel.findOne({
    phoneNumber: normalizedNumber,
  }).populate("vehicle", "key variants");
  let status: "existing" | "pre-registered" | "new";

  // If not, create with phone number only (check pre-reg if needed)
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
  } else {
    status = "existing";
  }

  // Generate JWT for the driver
  const token = generateJWT({
    id: driver._id,
    phoneNumber: driver.phoneNumber,
    userType: "driver",
  });

  // Safely get vehicle key
  const vehicleKey =
    driver.vehicle &&
    typeof driver.vehicle === "object" &&
    "key" in driver.vehicle
      ? (driver.vehicle as { key: string }).key
      : null;

  // Find the variant within the populated vehicle's variants array
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
      vehicleImage: driver.images.frontView,
      serviceAreas: driver.serviceAreas,
      firstName: driver.firstName,
      lastName: driver.lastName,
      vehicle: vehicleVariantLoad
        ? `${vehicleKey}_${vehicleVariantLoad}`
        : vehicleKey,
    },
  });
};

// import { RequestHandler } from "express";
// import DriverModel from "../../models/Driver";
// import { PreRegDriverModel } from "../../models/PreRegDriver";
// import { generateJWT } from "../../utils/helpers/jwt";
// import {
//   checkPhoneRateLimit,
//   isValidOTPFormat,
//   normalizePHPhoneNumber,
//   storeOTP,
//   verifyStoredOTP,
// } from "../../utils/helpers/phoneNumber";
// import mongoose from "mongoose";
// import axios from "axios";

// // Semaphore configuration
// const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY!;
// const SEMAPHORE_OTP_URL = "https://semaphore.co/api/v4/otp";

// export const sendOTP: RequestHandler = async (req, res) => {
//   const { phoneNumber } = req.body;

//   if (!phoneNumber) {
//     return res.status(400).json({
//       error: "Phone number is required",
//     });
//   }

//   const normalized = normalizePHPhoneNumber(phoneNumber);

//   if (!normalized) {
//     return res.status(400).json({
//       error: "Invalid Philippine mobile number",
//     });
//   }

//   // Check phone-based rate limiting
//   const canSend = await checkPhoneRateLimit(normalized);
//   if (!canSend) {
//     return res.status(429).json({
//       error:
//         "Too many OTP requests for this number. Please try again in a minute.",
//       success: false,
//     });
//   }

//   try {
//     // Send OTP using Semaphore API
//     const response = await axios.post(
//       SEMAPHORE_OTP_URL,
//       new URLSearchParams({
//         apikey: SEMAPHORE_API_KEY,
//         number: normalized,
//         message:
//           "Your FastMet verification code is {otp}. Valid for 10 minutes.",
//       }).toString(),
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       },
//     );

//     console.log("[Semaphore OTP] Sent to", normalized);
//     console.log("[Semaphore Response]", response.data);

//     // Semaphore returns the OTP code in the response
//     const otpCode = response.data[0]?.code;

//     if (!otpCode) {
//       throw new Error("Failed to generate OTP");
//     }

//     // Store OTP in Redis for verification
//     await storeOTP(normalized, String(otpCode));

//     res.status(200).json({
//       success: true,
//       message: "OTP sent successfully",
//     });
//   } catch (error: any) {
//     console.error("[Semaphore Error]", error.message);
//     console.error("[Semaphore Response]", error.response?.data);

//     // Handle Semaphore API errors
//     if (error.response) {
//       const status = error.response.status;
//       const data = error.response.data;

//       // Semaphore error can be a string or object
//       let errorMsg = "";
//       if (typeof data === "string") {
//         errorMsg = data.toLowerCase();
//       } else if (data?.message) {
//         errorMsg = data.message.toLowerCase();
//       } else if (data?.error) {
//         errorMsg = data.error.toLowerCase();
//       } else {
//         errorMsg = JSON.stringify(data).toLowerCase();
//       }

//       console.error("[Semaphore Error Details]", errorMsg);

//       // Check for specific Semaphore errors
//       if (
//         status === 403 ||
//         errorMsg.includes("insufficient") ||
//         errorMsg.includes("balance") ||
//         errorMsg.includes("credit")
//       ) {
//         return res.status(503).json({
//           error:
//             "SMS service is temporarily unavailable. Please try again later.",
//           success: false,
//           code: "INSUFFICIENT_BALANCE",
//         });
//       }

//       if (
//         status === 401 ||
//         (errorMsg.includes("invalid") && errorMsg.includes("api"))
//       ) {
//         return res.status(500).json({
//           error: "Service configuration error. Please contact support.",
//           success: false,
//           code: "INVALID_API_KEY",
//         });
//       }

//       if (errorMsg.includes("invalid") && errorMsg.includes("number")) {
//         return res.status(400).json({
//           error: "Invalid phone number format",
//           success: false,
//         });
//       }
//     }

//     // Generic error
//     return res.status(500).json({
//       error: "Failed to send OTP. Please try again.",
//       success: false,
//     });
//   }
// };

// export const verifyOTP: RequestHandler = async (req, res) => {
//   const { phoneNumber, otpCode: otp } = req.body;

//   if (!phoneNumber || !otp) {
//     return res.status(400).json({
//       error: "Phone number and OTP are required",
//       success: false,
//     });
//   }

//   // Validate OTP format before hitting Redis
//   if (!isValidOTPFormat(otp)) {
//     return res.status(400).json({
//       error: "Invalid OTP format",
//       success: false,
//     });
//   }

//   const normalizedNumber = normalizePHPhoneNumber(phoneNumber);

//   if (!normalizedNumber) {
//     return res.status(400).json({
//       error: "Invalid Philippine mobile number",
//       success: false,
//     });
//   }

//   try {
//     // Verify OTP from Redis (includes brute-force protection)
//     const result = await verifyStoredOTP(normalizedNumber, otp);

//     if (result.locked) {
//       return res.status(429).json({
//         error: "Too many failed attempts. Please request a new OTP.",
//         success: false,
//       });
//     }

//     if (!result.valid) {
//       return res.status(400).json({
//         error: "Invalid or expired OTP. Please try again.",
//         success: false,
//       });
//     }

//     // ============================================
//     // OTP VERIFIED - Your existing driver logic
//     // ============================================

//     // Simple: check if driver exists
//     let driver = await DriverModel.findOne({
//       phoneNumber: normalizedNumber,
//     }).populate("vehicle", "key variants");
//     let status: "existing" | "pre-registered" | "new";

//     // If not, create with phone number only (check pre-reg if needed)
//     if (!driver) {
//       const preReg = await PreRegDriverModel.findOne({
//         phoneNumber: normalizedNumber,
//       });

//       status = preReg ? "pre-registered" : "new";

//       driver = await DriverModel.create({
//         phoneNumber: normalizedNumber,
//         ...(preReg && {
//           firstName: preReg.firstName,
//           lastName: preReg.lastName,
//           vehicle: new mongoose.Types.ObjectId(preReg.vehicle),
//           preRegId: preReg._id,
//         }),
//       });
//     } else {
//       status = "existing";
//     }

//     // Generate JWT for the driver
//     const token = generateJWT({
//       id: driver._id,
//       phoneNumber: driver.phoneNumber,
//       userType: "driver",
//     });

//     // Safely get vehicle key
//     const vehicleKey =
//       driver.vehicle &&
//       typeof driver.vehicle === "object" &&
//       "key" in driver.vehicle
//         ? (driver.vehicle as { key: string }).key
//         : null;

//     // Find the variant within the populated vehicle's variants array
//     let vehicleVariantLoad: number | null = null;
//     if (
//       driver.vehicleVariant &&
//       driver.vehicle &&
//       typeof driver.vehicle === "object" &&
//       "variants" in driver.vehicle
//     ) {
//       const vehicle = driver.vehicle as {
//         variants: Array<{ _id: mongoose.Types.ObjectId; maxLoadKg: number }>;
//       };
//       const variant = vehicle.variants.find(
//         (v) => v._id.toString() === driver.vehicleVariant?.toString(),
//       );
//       vehicleVariantLoad = variant?.maxLoadKg ?? null;
//     }

//     return res.status(200).json({
//       success: true,
//       status,
//       token,
//       driver: {
//         id: driver._id,
//         phoneNumber: driver.phoneNumber,
//         license: driver.licenseNumber,
//         profilePictureUrl: driver.profilePictureUrl,
//         vehicleImage: driver.images.frontView,
//         serviceAreas: driver.serviceAreas,
//         firstName: driver.firstName,
//         lastName: driver.lastName,
//         vehicle: vehicleVariantLoad
//           ? `${vehicleKey}_${vehicleVariantLoad}`
//           : vehicleKey,
//       },
//     });
//   } catch (error: any) {
//     console.error("[OTP Verify Error]", error.message);

//     return res.status(500).json({
//       error: "Failed to verify OTP. Please try again.",
//       success: false,
//     });
//   }
// };
