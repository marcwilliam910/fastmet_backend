import {RequestHandler} from "express";
import DriverModel from "../../models/Driver";
import {PreRegDriverModel} from "../../models/PreRegDriver";
import {generateJWT} from "../../utils/helpers/jwt";
import {normalizePHPhoneNumber} from "../../utils/helpers/phoneNumber";
import mongoose from "mongoose";

export const sendOTP: RequestHandler = async (req, res) => {
  const {phoneNumber} = req.body;

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
  const {phoneNumber, otpCode: otp} = req.body;

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
      ? (driver.vehicle as {key: string}).key
      : null;

  // Find the variant within the populated vehicle's variants array
  let vehicleVariantLoad: number | null = null;
  if (
    driver.vehicleVariant &&
    driver.vehicle &&
    typeof driver.vehicle === "object" &&
    "variants" in driver.vehicle
  ) {
    const vehicle = driver.vehicle as {variants: Array<{_id: mongoose.Types.ObjectId; maxLoadKg: number}>};
    const variant = vehicle.variants.find(
      (v) => v._id.toString() === driver.vehicleVariant?.toString()
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
