import {ErrorRequestHandler} from "express";

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  console.error(err.stack);
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
