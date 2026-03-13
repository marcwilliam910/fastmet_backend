import { RequestHandler } from "express";
import UserModel from "../../models/User";
import { generateJWT } from "../../utils/helpers/jwt";
import { PreRegUserModel } from "../../models/PreRegUser";

export const login: RequestHandler = async (req, res) => {
  const normalizedNumber = req.verifiedPhone!;

  let user = await UserModel.findOne({
    phoneNumber: normalizedNumber,
  });

  let status: "existing" | "pre-registered" | "new";

  if (!user) {
    const preReg = await PreRegUserModel.findOne({
      phoneNumber: normalizedNumber,
    });

    status = preReg ? "pre-registered" : "new";

    user = await UserModel.create({
      phoneNumber: normalizedNumber,
      ...(preReg && {
        fullName: preReg.firstName + " " + preReg.lastName,
        preRegId: preReg._id,
        gender: preReg.gender,
        isProfileComplete: true,
      }),
    });
  } else {
    status = "existing";
  }

  const token = generateJWT({
    id: user._id,
    phoneNumber: user.phoneNumber,
    userType: "client",
  });

  return res.status(200).json({
    success: true,
    token,
    status,
    client: {
      id: user._id,
      isProfileComplete: user.isProfileComplete,
      fullName: user.fullName,
      profilePictureUrl: user.profilePictureUrl,
      phoneNumber: user.phoneNumber,
      address:
        user.address &&
        typeof user.address === "object" &&
        "coords" in (user.address as any) &&
        (user.address as any).coords &&
        typeof (user.address as any).coords.lat === "number" &&
        typeof (user.address as any).coords.lng === "number"
          ? user.address
          : null,
      gender: user.gender,
      preRegistered: user.preRegId ? true : false,
    },
  });
};
