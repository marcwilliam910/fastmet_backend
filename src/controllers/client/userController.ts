import { RequestHandler } from "express";
import UserModel from "../../models/User";

export const registerProfile: RequestHandler = async (req, res) => {
  const {
    uid,
    email,
    firstName,
    lastName,
    middleName,
    birthDate,
    profilePictureUrl,
    fromOAuth,
  } = req.body;

  if (!uid || !email || !firstName) {
    return res
      .status(400)
      .json({ message: "Missing required fields", success: false });
  }
  const user = await UserModel.updateOne(
    { email, uid }, // Match by unique field
    {
      $setOnInsert: {
        uid,
        email,
        firstName,
        lastName,
        middleName,
        birthDate,
        profilePictureUrl,
        fromOAuth,
      },
    },
    { upsert: true }
  );

  res.status(200).json({ message: "Profile registered", user, success: true });
};

export const getProfile: RequestHandler = async (req, res) => {
  const { uid } = req.params;
  const user = await UserModel.findOne({ uid });
  if (!user) {
    return res.status(404).json({ message: "User not found", success: false });
  }
  res.status(200).json({ user, success: true, message: "Profile fetched" });
};

export const updateProfile: RequestHandler = async (req, res) => {
  const { uid } = req.params;
  const { firstName, lastName, middleName, contactNumber, profilePictureUrl } =
    req.body;
  // const user = await UserModel.findOne({uid});
  // if (!user) {
  //   return res.status(404).json({message: "User not found", success: false});
  // }
  // user.firstName = firstName;
  // user.lastName = lastName;
  // user.middleName = middleName;
  // user.birthDate = birthDate;
  // user.profilePictureUrl = profilePictureUrl;
  // await user.save();

  const user = await UserModel.findOneAndUpdate(
    { uid },
    {
      firstName,
      lastName,
      middleName,
      contactNumber,
      profilePictureUrl,
    },
    { new: true }
  );

  if (!user) {
    return res.status(404).json({ message: "User not found", success: false });
  }

  res.status(200).json({ user, success: true, message: "Profile updated" });
};
