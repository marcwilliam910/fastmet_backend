import { RequestHandler } from "express";
import { getUserId } from "../../utils/helpers/getUserId";
import {
  deleteImageFromCloudinary,
  getSecureFolderId,
  uploadImageToCloudinary,
} from "../../services/cloudinaryService";
import UserModel from "../../models/User";
import { isBlank } from "../driver/profileController";

export type UserAddress = {
  name: string;
  fullAddress: string;
  coords: { lat: number; lng: number };
  street: string;
  barangay: string;
  city: string;
  province: string;
} | null;

const asRequiredTrimmedString = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
};

const asNumberOrNull = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const buildAddressFromBody = (
  body: any,
):
  | { ok: true; address: UserAddress; anyProvided: boolean }
  | { ok: false; error: string } => {
  const anyProvided =
    body?.addressName !== undefined ||
    body?.addressFullAddress !== undefined ||
    body?.addressLat !== undefined ||
    body?.addressLng !== undefined ||
    body?.addressStreet !== undefined ||
    body?.addressBarangay !== undefined ||
    body?.addressCity !== undefined ||
    body?.addressProvince !== undefined;

  if (!anyProvided) {
    return { ok: true, address: null, anyProvided: false };
  }

  const name = asRequiredTrimmedString(body?.addressName);
  const fullAddress = asRequiredTrimmedString(body?.addressFullAddress);
  const street = asRequiredTrimmedString(body?.addressStreet);
  const barangay = asRequiredTrimmedString(body?.addressBarangay);
  const city = asRequiredTrimmedString(body?.addressCity);
  const province = asRequiredTrimmedString(body?.addressProvince);

  const lat = asNumberOrNull(body?.addressLat);
  const lng = asNumberOrNull(body?.addressLng);

  if (
    !name ||
    !fullAddress ||
    !street ||
    !barangay ||
    !city ||
    !province ||
    lat === null ||
    lng === null
  ) {
    return {
      ok: false,
      error: "Address fields are required",
    };
  }

  const address: NonNullable<UserAddress> = {
    name,
    fullAddress,
    coords: { lat, lng },
    street,
    barangay,
    city,
    province,
  };

  return { ok: true, address, anyProvided: true };
};

export const registerProfile: RequestHandler = async (req, res) => {
  const clientId = getUserId(req);
  const { fullName, gender } = req.body;
  const file = req.file;

  // Validation
  if (!clientId) {
    return res.status(400).json({
      success: false,
      error: "Client ID is required",
    });
  }

  const parsedAddress = buildAddressFromBody(req.body);
  if (!parsedAddress.ok) {
    return res.status(400).json({
      success: false,
      error: parsedAddress.error,
    });
  }

  if (isBlank(fullName) || isBlank(gender) || !parsedAddress.address) {
    return res.status(400).json({
      success: false,
      error: "All fields are required",
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
      address: parsedAddress.address,
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
};

export const updateProfile: RequestHandler = async (req, res) => {
  const clientId = getUserId(req);
  const { fullName, gender, deleteProfilePicture } = req.body;
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

  if (fullName !== undefined) {
    if (isBlank(fullName)) {
      return res.status(400).json({
        success: false,
        error: "fullName must not be blank",
      });
    }
    updateData.fullName = fullName;
  }

  if (gender !== undefined) {
    if (isBlank(gender)) {
      return res.status(400).json({
        success: false,
        error: "gender must not be blank",
      });
    }
    updateData.gender = gender;
  }

  const parsedAddress = buildAddressFromBody(req.body);
  if (!parsedAddress.ok) {
    return res.status(400).json({
      success: false,
      error: parsedAddress.error,
    });
  }

  if (parsedAddress.anyProvided) {
    updateData.address = parsedAddress.address;
  }

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
    updateData.profilePictureUrl = await uploadImageToCloudinary(file.buffer, {
      folder: `fastmet/clients/${getSecureFolderId(clientId)}`,
      publicId: "profile",
    });
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({
      success: false,
      error: "No fields to update",
    });
  }

  // Update user
  const user = await UserModel.findOneAndUpdate({ _id: clientId }, updateData, {
    new: true,
  });

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
};
