import cloudinary from "../config/cloudinary"; // your cloudinary config
import sharp from "sharp";
import crypto from "crypto";

interface UploadOptions {
  folder: string;
  publicId: string;
  maxWidth?: number;
  quality?: number;
}

// Security: Hash user IDs for folder names
export const getSecureFolderId = (userId: string): string => {
  const salt = process.env.CLOUDINARY_FOLDER_SALT;

  if (!salt) {
    throw new Error("CLOUDINARY_FOLDER_SALT environment variable is not set");
  }

  return crypto
    .createHash("sha256")
    .update(userId + salt)
    .digest("hex")
    .substring(0, 16); // Use first 16 characters
};

interface ImageConfig {
  maxWidth: number;
  quality: number;
}

const IMAGE_CONFIGS: Record<string, ImageConfig> = {
  profile: { maxWidth: 500, quality: 85 },
  receipt: { maxWidth: 1200, quality: 80 },
  package: { maxWidth: 1200, quality: 80 },
  booking: { maxWidth: 1200, quality: 80 },
  default: { maxWidth: 1200, quality: 80 },
};

export const uploadImageToCloudinary = async (
  buffer: Buffer,
  options: UploadOptions,
): Promise<string> => {
  try {
    // Get config based on image type (from publicId)
    const imageType = options.publicId.split("_")[0] || "default";
    const config = IMAGE_CONFIGS[imageType] || IMAGE_CONFIGS.default;

    // Use provided values or defaults from config
    const maxWidth = options.maxWidth || config.maxWidth;
    const quality = options.quality || config.quality;

    // Compress and resize image using sharp
    const compressedBuffer = await sharp(buffer)
      .resize(maxWidth, maxWidth, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    // Upload to Cloudinary
    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder,
          public_id: options.publicId,
          overwrite: true,
          resource_type: "image",
          transformation: [
            { quality: "auto:good" },
            { fetch_format: "auto" }, // Auto WebP when supported
          ],
        },
        (error, result) => {
          if (error || !result) {
            reject(error || new Error("Upload failed"));
          } else {
            resolve(result);
          }
        },
      );

      stream.end(compressedBuffer);
    });

    return result.secure_url;
  } catch (error) {
    console.error("Error uploading to Cloudinary:", error);
    throw new Error("Failed to upload image");
  }
};

export const deleteImageFromCloudinary = async (
  publicId: string,
): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Error deleting from Cloudinary:", error);
    // Don't throw - deletion errors shouldn't block the update
  }
};

export const uploadMultipleImagesToCloudinary = async (
  files: Express.Multer.File[],
  folder: string,
  imageType: string = "default",
): Promise<string[]> => {
  const config = IMAGE_CONFIGS[imageType] || IMAGE_CONFIGS.default;

  const uploadPromises = files.map(async (file, index) => {
    try {
      // Compress image using sharp
      const compressedBuffer = await sharp(file.buffer)
        .resize(config.maxWidth, config.maxWidth, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: config.quality, mozjpeg: true })
        .toBuffer();

      // Upload to Cloudinary
      const result = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: `${Date.now()}-${index}`,
            resource_type: "image",
            transformation: [
              { quality: "auto:good" },
              { fetch_format: "auto" },
            ],
          },
          (error, result) => {
            if (error || !result) {
              reject(error || new Error("Upload failed"));
            } else {
              resolve(result);
            }
          },
        );

        stream.end(compressedBuffer);
      });

      return result.secure_url;
    } catch (error) {
      console.error(`Error uploading file ${index}:`, error);
      throw error;
    }
  });

  return Promise.all(uploadPromises);
};

export const uploadBase64ImageToCloudinary = async (
  base64Image: string,
  folder: string,
  imageType: string = "default",
): Promise<string> => {
  try {
    const config = IMAGE_CONFIGS[imageType] || IMAGE_CONFIGS.default;

    // Extract base64 data from the image URI (if it's data URI)
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Compress image using sharp
    const compressedBuffer = await sharp(buffer)
      .resize(config.maxWidth, config.maxWidth, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: config.quality, mozjpeg: true })
      .toBuffer();

    // Upload to Cloudinary
    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: "image",
          transformation: [{ quality: "auto:good" }, { fetch_format: "auto" }],
        },
        (error, result) => {
          if (error || !result) {
            reject(error || new Error("Upload failed"));
          } else {
            resolve(result);
          }
        },
      );

      stream.end(compressedBuffer);
    });

    return result.secure_url;
  } catch (error) {
    console.error("Error uploading base64 image:", error);
    throw new Error("Image upload failed");
  }
};

// New function for multiple images with custom publicIds
export const uploadMultipleImagesWithPublicIds = async (
  files: Express.Multer.File[],
  folder: string,
  publicIds: string[],
  imageType: string = "default",
): Promise<Array<{ type: string; url: string }>> => {
  const config = IMAGE_CONFIGS[imageType] || IMAGE_CONFIGS.default;
  const results: Array<{ type: string; url: string }> = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const publicId = publicIds[index];

    try {
      // Compress
      const compressedBuffer = await sharp(file.buffer)
        .resize(config.maxWidth, config.maxWidth, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: config.quality, mozjpeg: true })
        .toBuffer();

      // Free original buffer immediately after compression
      file.buffer = Buffer.alloc(0);

      // Upload to Cloudinary
      const result = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Cloudinary upload timed out for file ${index}`));
        }, 60000);

        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            public_id: publicId,
            overwrite: true,
            resource_type: "image",
            transformation: [
              { quality: "auto:good" },
              { fetch_format: "auto" },
            ],
          },
          (error, result) => {
            clearTimeout(timeout);
            if (error || !result) {
              reject(error || new Error("Upload failed"));
            } else {
              resolve(result);
            }
          },
        );

        stream.end(compressedBuffer);
      });

      results.push({ type: publicId, url: result.secure_url });
    } catch (error) {
      console.error(`Error uploading file ${index}:`, error);
      throw error;
    }
  }

  return results;
};

export const uploadWatermarkedImageToCloudinary = async (
  imageBuffer: Buffer,
  watermarkSVG: string,
  options: {
    folder: string;
    publicId: string;
    quality?: number;
  },
): Promise<any> => {
  try {
    // Composite watermark onto image and compress
    const watermarkedImage = await sharp(imageBuffer)
      .composite([
        {
          input: Buffer.from(watermarkSVG),
        },
      ])
      .jpeg({
        quality: options.quality || 85,
        mozjpeg: true,
      })
      .toBuffer();

    // Upload to Cloudinary
    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder,
          public_id: options.publicId,
          overwrite: false,
          resource_type: "image",
          transformation: [{ quality: "auto:good" }, { fetch_format: "auto" }],
        },
        (error, result) => {
          if (error || !result) {
            reject(error || new Error("Upload failed"));
          } else {
            resolve(result);
          }
        },
      );

      stream.end(watermarkedImage);
    });

    return result;
  } catch (error) {
    console.error("Error uploading watermarked image:", error);
    throw error;
  }
};
