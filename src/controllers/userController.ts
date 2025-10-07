import {RequestHandler} from "express";
import UserModel from "../models/User";

export const registerProfile: RequestHandler = async (req, res) => {
  const {
    uid,
    email,
    firstName,
    lastName,
    middleName,
    birthDate,
    profilePictureUrl,
  } = req.body;

  if (!uid || !email || !firstName || !lastName) {
    return res
      .status(400)
      .json({message: "Missing required fields", success: false});
  }
  const user = await UserModel.create({
    uid,
    email,
    firstName,
    lastName,
    middleName,
    birthDate,
    profilePictureUrl,
  });

  res.status(200).json({message: "Profile registered", user, success: true});
};

export const getProfile: RequestHandler = async (req, res) => {
  const {uid} = req.params;
  const user = await UserModel.findOne({uid});
  if (!user) {
    return res.status(404).json({message: "User not found", success: false});
  }
  res.status(200).json({user, success: true, message: "Profile fetched"});
};
