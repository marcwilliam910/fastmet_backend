import { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  console.error(err.stack);

  // 🆕 Handle Mongoose ValidationError
  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: err.errors, // Contains all validation errors
    });
  }

  // 🆕 Handle Mongoose CastError (invalid ObjectId, etc.)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format",
    });
  }

  // Custom errors (with status code)
  if ((err as any).status) {
    return res.status((err as any).status).json({
      success: false,
      message: err.message,
    });
  }

  // Fallback
  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
};
