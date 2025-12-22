import { RequestHandler } from "express";
import BookingModel from "../../models/Booking";
import mongoose from "mongoose";
import { getUserId } from "../../utils/helpers/getUserId";
import sharp from "sharp";
import cloudinary from "../../config/cloudinary";

// not used currently
// export const getActiveBooking: RequestHandler = async (req, res) => {
//   const driverId = getUserId(req);
//   const activeBooking = await BookingModel.findOne({
//     status: "active",
//     "driver.id": new mongoose.Types.ObjectId(driverId),
//   })
//     .populate({
//       path: "customerId", // field that references User model
//       select: "fullName profilePictureUrl phoneNumber", // select needed fields
//     })
//     .lean(); // .lean() for plain JS object (optional, for better performance)

//   if (!activeBooking) {
//     return res.status(404).json({ message: "No active booking found" });
//   }

//   // Rename userId to client
//   const { customerId, ...rest } = activeBooking as any;
//   const formattedBooking = {
//     ...rest,
//     client: {
//       id: customerId._id,
//       name: customerId.fullName,
//       profilePictureUrl: customerId.profilePictureUrl,
//       phoneNumber: customerId.phoneNumber,
//     },
//   };

//   res.status(200).json(formattedBooking);
// };

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
    now.getTime() - lateThresholdMinutes * 60 * 1000
  );

  const query: any = {
    "driver.id": new mongoose.Types.ObjectId(driverId),
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
    "driver.id": new mongoose.Types.ObjectId(driverId),
    status: status,
  });

  res.status(200).json({
    bookings,
    nextPage: pageNum * limitNum < total ? pageNum + 1 : null,
  });
};

export const getTotalCompletedAndScheduledBookings: RequestHandler = async (
  req,
  res
) => {
  const driverId = getUserId(req);

  if (!driverId) {
    return res.status(400).json({ message: "Missing user ID" });
  }

  const totalActiveBookings = await BookingModel.countDocuments({
    "driver.id": new mongoose.Types.ObjectId(driverId),
    status: "active",
  });

  const totalCompletedBookings = await BookingModel.countDocuments({
    "driver.id": new mongoose.Types.ObjectId(driverId),
    status: "completed",
  });

  const now = new Date();
  const lateThresholdMinutes = 30;

  const lateBoundary = new Date(
    now.getTime() - lateThresholdMinutes * 60 * 1000
  );

  const totalScheduledBookings = await BookingModel.countDocuments({
    "driver.id": new mongoose.Types.ObjectId(driverId),
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
    if (!req.file) {
      return res.status(400).json({ error: "No receipt image provided" });
    }

    const { location, timestamp } = req.body;
    const driverId = getUserId(req);

    if (!driverId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!location || !timestamp) {
      return res.status(400).json({ error: "Missing location or timestamp" });
    }

    const imageBuffer = req.file.buffer;

    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const { width = 1000, height = 1000 } = metadata;

    // Calculate responsive sizing
    const fontSize = Math.max(14, Math.floor(width / 50));
    const iconSize = Math.floor(fontSize * 1.2);
    const lineHeight = Math.floor(fontSize * 2.2);
    const padding = Math.floor(fontSize * 1.2);
    const margin = Math.floor(fontSize * 0.8);

    // Create professional watermark (inspired by delivery apps)
    const watermarkSVG = `
      <svg width="${width}" height="${height}">
        <defs>
          <!-- Subtle shadow for depth -->
          <filter id="subtleShadow">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
          </filter>
          
          <!-- Icon style -->
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
        
        <!-- Semi-transparent gradient overlay at bottom -->
        <defs>
          <linearGradient id="bgGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:rgb(0,0,0);stop-opacity:0" />
            <stop offset="100%" style="stop-color:rgb(0,0,0);stop-opacity:0.85" />
          </linearGradient>
        </defs>
        
        <rect x="0" y="${height - lineHeight * 2 - padding * 3}" 
              width="${width}" height="${lineHeight * 2 + padding * 3}" 
              fill="url(#bgGradient)"/>
        
        <!-- Location section -->
        <g transform="translate(${padding}, ${
      height - lineHeight * 2 - padding * 2
    })">
          <!-- Location icon (pin) -->
          <circle cx="${iconSize / 2}" cy="${iconSize / 2}" r="${
      iconSize / 2.5
    }" 
                  fill="#e4483cff" opacity="0.9"/>
          <text x="${iconSize / 2}" y="${iconSize / 2 + iconSize / 4}" 
                class="icon" fill="white" text-anchor="middle">📍</text>
          
          <!-- Location text -->
          <text x="${iconSize + margin}" y="${iconSize / 2 + fontSize / 3}" 
                class="text" fill="white">${location}</text>
        </g>
        
        <!-- Timestamp section -->
        <g transform="translate(${padding}, ${height - lineHeight - padding})">
          <!-- Time icon (clock) -->
          <circle cx="${iconSize / 2}" cy="${iconSize / 2}" r="${
      iconSize / 2.5
    }" 
                  fill="#4A90E2" opacity="0.9"/>
          <text x="${iconSize / 2}" y="${iconSize / 2 + iconSize / 4}" 
                class="icon" fill="white" text-anchor="middle">🕐</text>
          
          <!-- Timestamp text -->
          <text x="${iconSize + margin}" y="${iconSize / 2 + fontSize / 3}" 
                class="text" fill="white">${timestamp}</text>
        </g>
        
        <!-- Optional: Add "Verified Delivery" badge in top-right -->
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

    // Composite watermark onto image
    const watermarkedImage = await sharp(imageBuffer)
      .composite([
        {
          input: Buffer.from(watermarkSVG),
        },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    const publicId =
      typeof req.file.originalname === "string" && req.file.originalname.length
        ? `receipt_${req.file.originalname.replace(
            /\.[^/.]+$/,
            ""
          )}_${Date.now()}`
        : `receipt_${Date.now()}`;

    // Upload to Cloudinary
    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `fastmet/drivers/${driverId}/receipts`,
          public_id: publicId,
          overwrite: false,
          resource_type: "image",
        },
        (error, result) => {
          if (error || !result) {
            reject(error || new Error("Upload failed"));
          } else {
            resolve(result);
          }
        }
      );

      stream.end(watermarkedImage);
    });

    // Return the secure URL
    return res.status(200).json({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      location,
      timestamp,
    });
  } catch (error) {
    console.error("Error uploading receipt:", error);
    return res.status(500).json({
      error: "Failed to upload receipt",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
