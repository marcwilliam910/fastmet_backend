import { RequestHandler } from "express";
import DriverModel from "../../models/Driver";
import cloudinary from "../../config/cloudinary";
import Driver from "../../models/Driver";
import { getUserId } from "../../utils/helpers/getUserId";

export const updateDriverProfile: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);
  const { name, email, vehicle, license: licenseNumber } = req.body;

  // Validation
  if (!driverId) {
    return res.status(400).json({
      success: false,
      error: "Driver ID is required",
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

  // Check if email is being changed and is already taken
  if (email && email !== driver.email) {
    const existingEmail = await DriverModel.findOne({
      email,
      _id: { $ne: driverId },
    });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        error: "Email is already taken",
      });
    }
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
  if (name) driver.name = name;
  if (email) driver.email = email;
  if (vehicle) driver.vehicle = vehicle;
  if (licenseNumber) driver.licenseNumber = licenseNumber;
  driver.registrationStep = 2;

  await driver.save();

  return res.status(200).json({
    success: true,
    driver: {
      id: driver._id,
      name: driver.name,
      email: driver.email,
      vehicle: driver.vehicle,
      licenseNumber: driver.licenseNumber,
      registrationStep: driver.registrationStep,
      approvalStatus: driver.approvalStatus,
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
            folder: `fastmet/drivers/${driverId}`,
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
