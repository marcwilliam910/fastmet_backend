import { RequestHandler } from "express";
import { generateJWT } from "../../utils/helpers/jwt";
import NewUserModel from "../../models/NewUser";

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

  let user = await NewUserModel.findOne({ phoneNumber: phoneNumber });
  let status: "existing" | "new";

  if (!user) {
    user = await NewUserModel.create({
      phoneNumber: phoneNumber,
    });
    status = "new";
  } else {
    status = "existing";
  }

  const token = generateJWT({
    id: user._id,
    phoneNumber: user.phoneNumber,
    userType: "client",
  });

  console.log(JSON.stringify(user, null, 2));

  return res.status(200).json({
    success: true,
    token,
    status,
    client: {
      id: user._id,
      isProfileComplete: user.isProfileComplete,
      fullName: user.fullName,
      profilePictureUrl: user.profilePictureUrl,
    },
  });
};
