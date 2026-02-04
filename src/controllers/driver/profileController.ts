import { RequestHandler } from "express";
import DriverModel from "../../models/Driver";
import Driver from "../../models/Driver";
import { getUserId } from "../../utils/helpers/getUserId";
import mongoose from "mongoose";
import {
  getSecureFolderId,
  deleteImageFromCloudinary,
  uploadImageToCloudinary,
  uploadMultipleImagesWithPublicIds,
} from "../../services/cloudinaryService";

export const isBlank = (v?: string | null) => !v || v.trim() === "";

const parseAndValidateServiceAreas = (
  serviceAreas: unknown
):
  | { ok: true; value: string[] }
  | { ok: false; error: "invalid_format" | "invalid_value" } => {
  let parsedAreas: unknown = serviceAreas;

  if (typeof serviceAreas === "string") {
    const trimmed = serviceAreas.trim();
    if (isBlank(trimmed)) {
      return { ok: false, error: "invalid_value" };
    }
    try {
      parsedAreas = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: "invalid_format" };
    }
  }

  if (
    !Array.isArray(parsedAreas) ||
    parsedAreas.length === 0 ||
    !parsedAreas.every((area) => typeof area === "string" && !isBlank(area))
  ) {
    return { ok: false, error: "invalid_value" };
  }

  return { ok: true, value: parsedAreas.map((a) => a.trim()) };
};

export const addDriverProfile: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);
  const {
    firstName,
    lastName,
    vehicle,
    license: licenseNumber,
    serviceAreas,
    vehicleVariant,
  } = req.body as {
    firstName: string;
    lastName: string;
    vehicle: string;
    license: string;
    serviceAreas: string;
    vehicleVariant: string;
  };

  console.log(vehicleVariant);

  // Validation
  if (!driverId) {
    return res.status(400).json({
      success: false,
      error: "Driver ID is required",
    });
  }

  const firstNameTrimmed =
    typeof firstName === "string" ? firstName.trim() : "";
  const lastNameTrimmed = typeof lastName === "string" ? lastName.trim() : "";
  const vehicleTrimmed = typeof vehicle === "string" ? vehicle.trim() : "";
  const licenseNumberTrimmed =
    typeof licenseNumber === "string" ? licenseNumber.trim() : "";
  const serviceAreasTrimmed =
    typeof serviceAreas === "string" ? serviceAreas.trim() : "";
  const vehicleVariantTrimmed =
    typeof vehicleVariant === "string" ? vehicleVariant.trim() : "";

  const file = req.file;
  if (isBlank(serviceAreasTrimmed)) {
    return res.status(400).json({
      success: false,
      error: "All fields are required",
    });
  }

  let serviceAreasArray: unknown;
  try {
    serviceAreasArray = JSON.parse(serviceAreasTrimmed);
  } catch {
    return res.status(400).json({
      success: false,
      error: "Invalid service areas format",
    });
  }

  if (
    isBlank(firstNameTrimmed) ||
    isBlank(lastNameTrimmed) ||
    isBlank(vehicleTrimmed) ||
    isBlank(licenseNumberTrimmed) ||
    !file ||
    !Array.isArray(serviceAreasArray) ||
    serviceAreasArray.length === 0 ||
    isBlank(vehicleVariantTrimmed)
  ) {
    return res.status(400).json({
      success: false,
      error: "All fields are required",
    });
  }

  let profilePictureUrl = "";

  // Upload to Cloudinary if file exists
  if (file) {
    profilePictureUrl = await uploadImageToCloudinary(file.buffer, {
      folder: `fastmet/drivers/${getSecureFolderId(driverId)}/profile_images`,
      publicId: "profile",
    });
  }

  // Find driver
  const driver = await DriverModel.findById(driverId);

  if (!driver) {
    return res.status(404).json({
      success: false,
      error: "Driver not found",
    });
  }

  // Validate PH license number format
  if (licenseNumberTrimmed) {
    if (/\s/.test(licenseNumberTrimmed)) {
      return res.status(400).json({
        success: false,
        error: "License number must not contain whitespaces",
      });
    }
    const phLicenseRegex = /^[A-Z]{1,3}\d{2}-\d{2}-\d{5,6}$/;
    if (!phLicenseRegex.test(licenseNumberTrimmed)) {
      return res.status(400).json({
        success: false,
        error:
          "License number must be in valid Philippine driver's license format (e.g., D12-34-567890)",
      });
    }
  }

  // Check if license number is already taken
  if (
    licenseNumberTrimmed &&
    licenseNumberTrimmed !== (driver.licenseNumber ?? "")
  ) {
    const existingLicense = await DriverModel.findOne({
      licenseNumber: licenseNumberTrimmed,
      _id: { $ne: driverId },
    });

    if (existingLicense) {
      return res.status(400).json({
        success: false,
        error: "License number is already registered",
      });
    }
  }

  // Update driver data
  if (profilePictureUrl) driver.profilePictureUrl = profilePictureUrl;
  driver.firstName = firstNameTrimmed;
  driver.lastName = lastNameTrimmed;
  driver.vehicle = new mongoose.Types.ObjectId(vehicleTrimmed);
  driver.licenseNumber = licenseNumberTrimmed;
  driver.serviceAreas = serviceAreasArray as any;
  driver.vehicleVariant = new mongoose.Types.ObjectId(vehicleVariantTrimmed);
  driver.registrationStep = 2;

  await driver.save();

  // Re-populate vehicle after save (this includes the variants array)
  await driver.populate("vehicle", "key variants");

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
      (v) => v._id.toString() === driver.vehicleVariant?.toString()
    );
    vehicleVariantLoad = variant?.maxLoadKg ?? null;
  }

  if (!vehicleVariantLoad) {
    return res.status(400).json({
      success: false,
      error: "Vehicle variant not found",
    });
  }

  return res.status(200).json({
    success: true,
    driver: {
      id: driver._id,
      firstName: driver.firstName,
      lastName: driver.lastName,
      vehicle: vehicleVariantLoad
        ? `${vehicleKey}_${vehicleVariantLoad}`
        : vehicleKey,
      licenseNumber: driver.licenseNumber,
      profilePictureUrl: driver.profilePictureUrl,
      serviceAreas: driver.serviceAreas,
    },
  });
};

export const uploadMultipleDriverImages: RequestHandler = async (req, res) => {
  try {
    const driverId = getUserId(req);
    const { step } = req.body;
    const imageTypes: string[] = Array.isArray(req.body.types)
      ? req.body.types
      : [req.body.types];

    if (!driverId) {
      return res.status(400).json({ message: "driverId required" });
    }

    if (!req.files || (req.files as any[]).length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const files = req.files as Express.Multer.File[];

    // Use the reusable service for multiple images with custom publicIds
    const uploadResults = await uploadMultipleImagesWithPublicIds(
      files,
      `fastmet/drivers/${getSecureFolderId(driverId)}/profile_images`,
      imageTypes,
      "profile" // Uses profile config: 500px, 85% quality
    );

    // Convert array to object
    const uploadedResults: Record<string, string> = {};
    uploadResults.forEach(({ type, url }) => {
      uploadedResults[type] = url;
    });

    // Save all uploaded URLs in MongoDB
    const updateObject: Record<string, any> = {};

    Object.entries(uploadedResults).forEach(([type, url]) => {
      updateObject[`images.${type}`] = url;
    });

    await Driver.findByIdAndUpdate(
      driverId,
      { ...updateObject, registrationStep: step },
      { new: true }
    );

    return res.json({
      message: "Uploaded all images successfully",
      success: true,
      images: uploadedResults,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Upload failed" });
  }
};

export const getDriverStatus: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);

  if (!driverId) {
    return res.status(400).json({ message: "driverId required" });
  }

  const driver = await Driver.findById(driverId);

  if (!driver) {
    return res.status(404).json({ message: "Driver not found" });
  }

  return res.json({
    success: true,
    approvalStatus: driver.approvalStatus,
    registrationStep: driver.registrationStep,
  });
};

export const updateServiceAreas: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);

  if (!driverId) {
    return res.status(400).json({ message: "driverId required" });
  }

  const driver = await Driver.findById(driverId);

  if (!driver) {
    return res.status(404).json({ message: "Driver not found" });
  }

  const { serviceAreas } = req.body;

  const parsed = parseAndValidateServiceAreas(serviceAreas);
  if (!parsed.ok) {
    return res.status(400).json({
      message:
        parsed.error === "invalid_format"
          ? "Invalid service areas format"
          : "Service areas must be a non-empty array of strings",
    });
  }

  driver.serviceAreas = parsed.value;

  await driver.save();

  return res.json({
    success: true,
    serviceAreas: driver.serviceAreas,
  });
};

export const updateDriverProfile: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);
  const { serviceAreas, deleteProfilePicture } = req.body as {
    serviceAreas?: unknown;
    deleteProfilePicture?: unknown;
  };
  const file = req.file;

  if (!driverId) {
    return res.status(400).json({
      success: false,
      error: "Driver ID is required",
    });
  }

  const driver = await DriverModel.findById(driverId);
  if (!driver) {
    return res.status(404).json({
      success: false,
      error: "Driver not found",
    });
  }

  const updateData: Record<string, any> = {};

  // Handle serviceAreas update (supports array or JSON string)
  if (serviceAreas !== undefined) {
    const parsed = parseAndValidateServiceAreas(serviceAreas);
    if (!parsed.ok) {
      return res.status(400).json({
        success: false,
        error:
          parsed.error === "invalid_format"
            ? "Invalid service areas format"
            : "Service areas must be a non-empty array of strings",
      });
    }

    updateData.serviceAreas = parsed.value;
  }

  // Handle profile picture deletion
  const shouldDelete =
    deleteProfilePicture === "true" || deleteProfilePicture === true;
  if (shouldDelete) {
    if (driver.profilePictureUrl) {
      const publicId = `fastmet/drivers/${getSecureFolderId(
        driverId
      )}/profile_images/profile`;
      await deleteImageFromCloudinary(publicId);
    }
    updateData.profilePictureUrl = "";
  }

  // Handle new profile picture upload (Cloudinary overwrites same publicId)
  if (file) {
    updateData.profilePictureUrl = await uploadImageToCloudinary(file.buffer, {
      folder: `fastmet/drivers/${getSecureFolderId(driverId)}/profile_images`,
      publicId: "profile",
    });
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({
      success: false,
      error: "No fields to update",
    });
  }

  const updatedDriver = await DriverModel.findByIdAndUpdate(
    driverId,
    updateData,
    { new: true }
  );

  if (!updatedDriver) {
    return res.status(404).json({
      success: false,
      error: "Driver not found",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Profile updated",
    driver: {
      id: updatedDriver._id,
      serviceAreas: updatedDriver.serviceAreas,
      profilePictureUrl: updatedDriver.profilePictureUrl,
    },
  });
};
