import { RequestHandler } from "express";
import DriverModel from "../../models/Driver";
import { PreRegDriverModel } from "../../models/PreRegDriver";
import { generateJWT } from "../../utils/jwt";

export const sendOTP: RequestHandler = async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({
      error: "Phone number is required",
    });
  }

  // TODO: Send OTP

  res.status(200).json({
    success: true,
  });
};

export const verifyOTP: RequestHandler = async (req, res) => {
  const { phoneNumber, otpCode: otp } = req.body;

  console.log(otp, phoneNumber);

  if (!phoneNumber || !otp) {
    return res.status(400).json({
      error: "Phone number and OTP are required",
      success: false,
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
  let driver = await DriverModel.findOne({ phone_number: phoneNumber });
  let status: "existing" | "pre-registered" | "new";

  // If not, create with phone number only (check pre-reg if needed)
  if (!driver) {
    const preReg = await PreRegDriverModel.findOne({
      phone_number: phoneNumber,
    });

    status = preReg ? "pre-registered" : "new";

    driver = await DriverModel.create({
      phone_number: phoneNumber,
      ...(preReg && {
        name: preReg.name,
        email: preReg.email,
        vehicle: preReg.vehicle,
        preRegId: preReg._id,
      }),
    });
  } else {
    status = "existing";
  }

  // Generate JWT for the driver
  const token = generateJWT({
    driverId: driver._id,
    phoneNumber: driver.phone_number,
    userType: "driver",
  });

  return res.status(200).json({
    success: true,
    status,
    token,
    driver: {
      id: driver._id,
      phoneNumber: driver.phone_number,
      isProfileComplete: driver.isProfileComplete,
      approvalStatus: driver.approvalStatus,
      ...(driver.name && { name: driver.name }),
      ...(driver.email && { email: driver.email }),
      ...(driver.vehicle && { vehicle: driver.vehicle }),
    },
  });
};
