import { RequestHandler } from "express";
import { getUserId } from "../../utils/helpers/getUserId";
import UserModel from "../../models/User";
import cloudinary from "../../config/cloudinary";

export const registerProfile: RequestHandler = async (req, res) => {
  try {
    const clientId = getUserId(req);
    const { fullName, address, gender } = req.body;
    const file = req.file;

    let profilePictureUrl = "";

    // Validation
    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: "Client ID is required",
      });
    }

    // Upload to Cloudinary if file exists
    if (file) {
      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `fastmet/clients/${clientId}`,
            public_id: "profile",
            overwrite: true,
            resource_type: "image",
          },
          (error, result) => {
            if (error || !result) reject(error);
            else resolve(result);
          }
        );

        stream.end(file.buffer);
      });

      profilePictureUrl = result.secure_url;
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
      { new: true }
    );

    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    res
      .status(200)
      .json({ user, success: true, message: "Profile registered" });
  } catch (error) {
    console.error("Error registering profile:", error);
    res
      .status(500)
      .json({ message: "Failed to register profile", success: false });
  }
};

// export const getProfile: RequestHandler = async (req, res) => {
//   const { uid } = req.params;
//   const user = await UserModel.findOne({ uid });
//   if (!user) {
//     return res.status(404).json({ message: "User not found", success: false });
//   }
//   res.status(200).json({ user, success: true, message: "Profile fetched" });
// };

// controllers
export const updateProfile: RequestHandler = async (req, res) => {
  try {
    const clientId = getUserId(req);
    const { fullName, address, gender, deleteProfilePicture } = req.body;
    const file = req.file;

    // Get current user
    const currentUser = await UserModel.findById(clientId);
    if (!currentUser) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    // Build update object
    const updateData: any = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (address !== undefined) updateData.address = address;
    if (gender !== undefined) updateData.gender = gender;

    // Handle profile picture deletion (only case where we manually delete)
    if (deleteProfilePicture === "true" || deleteProfilePicture === true) {
      if (currentUser.profilePictureUrl) {
        try {
          const publicId = `fastmet/clients/${clientId}/profile`;
          await cloudinary.uploader.destroy(publicId);
        } catch (error) {
          console.error("Error deleting from Cloudinary:", error);
        }
      }
      updateData.profilePictureUrl = "";
    }

    // Handle new profile picture upload (Cloudinary auto-replaces with overwrite: true)
    if (file) {
      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `fastmet/clients/${clientId}`,
            public_id: "profile",
            overwrite: true, // This automatically replaces the old image
            resource_type: "image",
          },
          (error, result) => {
            if (error || !result) reject(error);
            else resolve(result);
          }
        );

        stream.end(file.buffer);
      });

      updateData.profilePictureUrl = result.secure_url;
    }

    // Update user
    const user = await UserModel.findOneAndUpdate(
      { _id: clientId },
      updateData,
      { new: true }
    );

    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found", success: false });
    }

    res.status(200).json({ user, success: true, message: "Profile updated" });
  } catch (error) {
    console.error("Error updating profile:", error);
    res
      .status(500)
      .json({ message: "Failed to update profile", success: false });
  }
};
