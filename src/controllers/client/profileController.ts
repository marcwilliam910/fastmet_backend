import { RequestHandler } from "express";
import { getUserId } from "../../utils/helpers/getUserId";
import {
  deleteImageFromCloudinary,
  getSecureFolderId,
  uploadImageToCloudinary,
} from "../../services/cloudinaryService";
import UserModel from "../../models/User";

export const registerProfile: RequestHandler = async (req, res) => {
  try {
    const clientId = getUserId(req);
    const { fullName, address, gender } = req.body;
    const file = req.file;

    // Validation
    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: "Client ID is required",
      });
    }

    let profilePictureUrl = "";

    // Upload to Cloudinary if file exists
    if (file) {
      profilePictureUrl = await uploadImageToCloudinary(file.buffer, {
        folder: `fastmet/clients/${getSecureFolderId(clientId)}`,
        publicId: "profile",
      });
    }

    const user = await UserModel.findOneAndUpdate(
      { _id: clientId },
      {
        fullName,
        address,
        gender,
        profilePictureUrl,
        isProfileComplete: true,
      },
      { new: true },
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
        success: false,
      });
    }

    res.status(200).json({
      user,
      success: true,
      message: "Profile registered",
    });
  } catch (error) {
    console.error("Error registering profile:", error);
    res.status(500).json({
      message: "Failed to register profile",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const updateProfile: RequestHandler = async (req, res) => {
  try {
    const clientId = getUserId(req);
    const { fullName, address, gender, deleteProfilePicture } = req.body;
    const file = req.file;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: "Client ID is required",
      });
    }

    // Get current user
    const currentUser = await UserModel.findById(clientId);
    if (!currentUser) {
      return res.status(404).json({
        message: "User not found",
        success: false,
      });
    }

    // Build update object
    const updateData: any = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (address !== undefined) updateData.address = address;
    if (gender !== undefined) updateData.gender = gender;

    // Handle profile picture deletion
    if (deleteProfilePicture === "true" || deleteProfilePicture === true) {
      if (currentUser.profilePictureUrl) {
        const publicId = `fastmet/clients/${getSecureFolderId(clientId)}/profile`;
        await deleteImageFromCloudinary(publicId);
      }
      updateData.profilePictureUrl = "";
    }

    // Handle new profile picture upload
    // Note: Cloudinary auto-replaces with overwrite: true, no need to manually delete
    if (file) {
      updateData.profilePictureUrl = await uploadImageToCloudinary(
        file.buffer,
        {
          folder: `fastmet/clients/${getSecureFolderId(clientId)}`,
          publicId: "profile",
        },
      );
    }

    // Update user
    const user = await UserModel.findOneAndUpdate(
      { _id: clientId },
      updateData,
      { new: true },
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
        success: false,
      });
    }

    res.status(200).json({
      user,
      success: true,
      message: "Profile updated",
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({
      message: "Failed to update profile",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
