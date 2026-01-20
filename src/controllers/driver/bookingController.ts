import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";
import mongoose from "mongoose";
import { getUserId } from "../../utils/helpers/getUserId";
import sharp from "sharp";
import cloudinary from "../../config/cloudinary";
import {
  getSecureFolderId,
  uploadWatermarkedImageToCloudinary,
} from "../../services/cloudinaryService";

export const getBookings: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);
  const { page = 1, limit = 5, status } = req.query;

  if (!driverId || !status) {
    return res.status(400).json({ message: "Missing user ID or status" });
  }

  const pageNum = Number(page);
  const limitNum = Number(limit);

  const now = new Date();
  const lateThresholdMinutes = 30;

  const lateBoundary = new Date(
    now.getTime() - lateThresholdMinutes * 60 * 1000,
  );

  const query: any = {
    driverId: new mongoose.Types.ObjectId(driverId),
    status,
  };

  if (status === "scheduled") {
    query["bookingType.value"] = {
      $gte: lateBoundary, // includes late (≤ 30 mins)
    };
  }

  const bookings = await BookingModel.find(query)
    .sort({ "bookingType.value": 1 }) // chronological for scheduled
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);

  // Get total count to know if there are more pages
  const total = await BookingModel.countDocuments({
    driverId: new mongoose.Types.ObjectId(driverId),
    status: status,
  });

  res.status(200).json({
    bookings,
    nextPage: pageNum * limitNum < total ? pageNum + 1 : null,
  });
};

export const getAllBookingsCount: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);

  if (!driverId) {
    return res.status(400).json({ message: "Missing user ID" });
  }

  const totalActiveBookings = await BookingModel.countDocuments({
    driverId: new mongoose.Types.ObjectId(driverId),
    status: "active",
  });

  const totalCompletedBookings = await BookingModel.countDocuments({
    driverId: new mongoose.Types.ObjectId(driverId),
    status: "completed",
  });

  const now = new Date();
  const lateThresholdMinutes = 30;

  const lateBoundary = new Date(
    now.getTime() - lateThresholdMinutes * 60 * 1000,
  );

  const totalScheduledBookings = await BookingModel.countDocuments({
    driverId: new mongoose.Types.ObjectId(driverId),
    status: "scheduled",
    "bookingType.value": { $gte: lateBoundary },
  });

  res.status(200).json({
    totalActiveBookings,
    totalCompletedBookings,
    totalScheduledBookings,
  });
};

export const uploadReceipt: RequestHandler = async (req, res) => {
  try {
    // Check if files array exists
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: "No receipt images provided" });
    }

    const files = req.files as Express.Multer.File[];
    const { locations, timestamps, types, bookingId } = req.body;
    const driverId = getUserId(req);

    if (!driverId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Parse metadata arrays
    let locationsArray: string[];
    let timestampsArray: string[];
    let typesArray: string[];

    try {
      locationsArray = JSON.parse(locations);
      timestampsArray = JSON.parse(timestamps);
      typesArray = JSON.parse(types);
    } catch (error) {
      return res.status(400).json({ error: "Invalid metadata format" });
    }

    // Validate arrays length
    if (
      locationsArray.length !== files.length ||
      timestampsArray.length !== files.length ||
      typesArray.length !== files.length
    ) {
      return res.status(400).json({ error: "Metadata mismatch" });
    }

    // Process all images
    const uploadPromises = files.map(async (file, index) => {
      const location = locationsArray[index];
      const timestamp = timestampsArray[index];
      const type = typesArray[index];

      if (!location || !timestamp) {
        throw new Error(`Missing location or timestamp for image ${index}`);
      }

      const imageBuffer = file.buffer;

      // Get image dimensions
      const metadata = await sharp(imageBuffer).metadata();
      const { width = 1000, height = 1000 } = metadata;

      // Calculate responsive sizing
      const fontSize = Math.max(14, Math.floor(width / 50));
      const iconSize = Math.floor(fontSize * 1.2);
      const lineHeight = Math.floor(fontSize * 2.2);
      const padding = Math.floor(fontSize * 1.2);
      const margin = Math.floor(fontSize * 0.8);

      // Create professional watermark
      const watermarkSVG = `
        <svg width="${width}" height="${height}">
          <defs>
            <filter id="subtleShadow">
              <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
            </filter>
            
            <style>
              .icon { font-size: ${iconSize}px; }
              .text { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: ${fontSize}px;
                font-weight: 500;
              }
              .label {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: ${Math.floor(fontSize * 0.85)}px;
                font-weight: 400;
                opacity: 0.85;
              }
            </style>
          </defs>
          
          <defs>
            <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:rgb(0,0,0);stop-opacity:0" />
              <stop offset="100%" style="stop-color:rgb(0,0,0);stop-opacity:0.85" />
            </linearGradient>
          </defs>
          
          <rect x="0" y="${height - lineHeight * 2 - padding * 3}" 
                width="${width}" height="${lineHeight * 2 + padding * 3}" 
                fill="url(#bgGradient)"/>
          
          <g transform="translate(${padding}, ${
            height - lineHeight * 2 - padding * 2
          })">
            <circle cx="${iconSize / 2}" cy="${iconSize / 2}" r="${
              iconSize / 2.5
            }" 
                    fill="#e4483cff" opacity="0.9"/>
            <text x="${iconSize / 2}" y="${iconSize / 2 + iconSize / 4}" 
                  class="icon" fill="white" text-anchor="middle">📍</text>
            
            <text x="${iconSize + margin}" y="${iconSize / 2 + fontSize / 3}" 
                  class="text" fill="white">${location}</text>
          </g>
          
          <g transform="translate(${padding}, ${
            height - lineHeight - padding
          })">
            <circle cx="${iconSize / 2}" cy="${iconSize / 2}" r="${
              iconSize / 2.5
            }" 
                    fill="#4A90E2" opacity="0.9"/>
            <text x="${iconSize / 2}" y="${iconSize / 2 + iconSize / 4}" 
                  class="icon" fill="white" text-anchor="middle">🕐</text>
            
            <text x="${iconSize + margin}" y="${iconSize / 2 + fontSize / 3}" 
                  class="text" fill="white">${timestamp}</text>
          </g>
          
          <g transform="translate(${
            width - padding
          }, ${padding})" filter="url(#subtleShadow)">
            <rect x="-${fontSize * 8}" y="0" width="${fontSize * 8}" height="${
              fontSize * 2
            }" 
                  fill="rgba(76, 175, 80, 0.9)" rx="${fontSize / 2}"/>
            <text x="-${fontSize * 4}" y="${fontSize * 1.3}" 
                  class="text" fill="white" text-anchor="middle" font-weight="600">✓ VERIFIED</text>
          </g>
        </svg>
      `;

      const publicId =
        typeof file.originalname === "string" && file.originalname.length
          ? `${type}_${file.originalname.replace(
              /\.[^/.]+$/,
              "",
            )}_${Date.now()}`
          : `${type}_${Date.now()}`;

      // Upload with optimization using reusable service
      const result = await uploadWatermarkedImageToCloudinary(
        imageBuffer,
        watermarkSVG,
        {
          folder: `fastmet/drivers/${getSecureFolderId(driverId)}/bookings/${bookingId}`,
          publicId,
          quality: 85, // Optimized quality (was 92)
        },
      );

      return {
        success: true,
        url: result.secure_url,
        public_id: result.public_id,
        location,
        timestamp,
        type,
      };
    });

    // Wait for all uploads to complete
    const results = await Promise.all(uploadPromises);

    // If bookingId is provided, update the booking with images
    if (bookingId) {
      // Determine if this is pickup or dropoff based on types
      const isPickup = typesArray.some((t) => t.includes("pickup"));
      const isDropoff = typesArray.some(
        (t) => t.includes("receipt") || t.includes("package"),
      );

      if (isPickup) {
        // Update pickup images
        await BookingModel.findOneAndUpdate(
          { _id: bookingId },
          {
            "bookingImages.pickup.beforeImageUrl": results[0].url,
            "bookingImages.pickup.afterImageUrl": results[1].url,
          },
          { new: true },
        );
      } else if (isDropoff) {
        // Update dropoff images
        await BookingModel.findOneAndUpdate(
          { _id: bookingId },
          {
            "bookingImages.dropoff.receiptImageUrl": results[0].url,
            "bookingImages.dropoff.packageImageUrl": results[1].url,
          },
          { new: true },
        );
      }
    }

    // Return all URLs
    return res.status(200).json({
      success: true,
      urls: results.map((r) => r.url),
      results: results,
    });
  } catch (error) {
    console.error("Error uploading receipts:", error);
    return res.status(500).json({
      error: "Failed to upload receipts",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getCompletedCountData: RequestHandler = async (req, res) => {
  const driverId = getUserId(req);
  console.log(driverId);
  if (!driverId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const result = await BookingModel.aggregate([
    {
      $match: {
        driverId: new mongoose.Types.ObjectId(driverId),
        status: "completed",
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        total: { $sum: "$routeData.totalPrice" },
      },
    },
  ]);

  console.log(result);

  return res.status(200).json({
    totalBooked: result[0]?.count || 0,
    totalEarned: result[0]?.total || 0,
  });
};
