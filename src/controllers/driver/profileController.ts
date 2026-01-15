import { RequestHandler } from "express";
import DriverModel from "../../models/Driver";
import cloudinary from "../../config/cloudinary";
import Driver from "../../models/Driver";
import { getUserId } from "../../utils/helpers/getUserId";
import mongoose from "mongoose";

export const updateDriverProfile: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);
  const {
    firstName,
    lastName,
    vehicle,
    license: licenseNumber,
  } = req.body as {
    firstName: string;
    lastName: string;
    vehicle: string;
    license: string;
  };

  // Validation
  if (!driverId) {
    return res.status(400).json({
      success: false,
      error: "Driver ID is required",
    });
  }

  const file = req.file;

  let profilePictureUrl = "";

  // Upload to Cloudinary if file exists
  if (file) {
    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `fastmet/drivers/${driverId}/profile_images`,
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

  // Find driver
  const driver = await DriverModel.findById(driverId).populate(
    "vehicle",
    "key"
  );

  if (!driver) {
    return res.status(404).json({
      success: false,
      error: "Driver not found",
    });
  }

  // Check if license number is already taken
  if (licenseNumber && licenseNumber !== driver.licenseNumber) {
    const existingLicense = await DriverModel.findOne({
      licenseNumber,
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
  if (firstName) driver.firstName = firstName;
  if (lastName) driver.lastName = lastName;
  if (vehicle) driver.vehicle = new mongoose.Types.ObjectId(vehicle);
  if (licenseNumber) driver.licenseNumber = licenseNumber;
  if (profilePictureUrl) driver.profilePictureUrl = profilePictureUrl;
  driver.registrationStep = 2;

  await driver.save();

  // Safely get vehicle key
  const vehicleKey =
    driver &&
    driver.vehicle &&
    typeof driver.vehicle === "object" &&
    "key" in driver.vehicle
      ? (driver.vehicle as { key: string }).key
      : null;

  return res.status(200).json({
    success: true,
    driver: {
      id: driver._id,
      firstName: driver.firstName,
      lastName: driver.lastName,
      vehicle: vehicleKey,
      licenseNumber: driver.licenseNumber,
      profilePictureUrl: driver.profilePictureUrl,
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

    // Parallel uploads with Promise.all
    const uploadPromises = files.map((file, index) => {
      const type = imageTypes[index];

      return new Promise<{ type: string; url: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: `fastmet/drivers/${driverId}/profile_images`,
            public_id: type,
            overwrite: true,
            resource_type: "image",
          },
          (error, result) => {
            if (error || !result) {
              reject(error);
            } else {
              resolve({ type, url: result.secure_url });
            }
          }
        );

        stream.end(file.buffer);
      });
    });

    // Wait for all uploads to complete
    const uploadResults = await Promise.all(uploadPromises);

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
