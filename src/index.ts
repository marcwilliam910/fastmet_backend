import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import mongoose from "mongoose";

import { errorHandler } from "./middlewares/errorHandler";
import { initSocket } from "./sockets/socket";
import bookingRoute from "./routes/client/bookingRoute";
import driverBookingRoute from "./routes/driver/bookingRoute";
import userRoute from "./routes/client/userRoute";
import authDriverRoute from "./routes/driver/authRoute";
import profileDriverRoute from "./routes/driver/profileRoute";
import { authenticateJWT } from "./middlewares/verifyToken";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/client/user", userRoute);
app.use("/api/client/booking", bookingRoute);

app.use("/api/driver/auth", authDriverRoute);
app.use("/api/driver/booking", authenticateJWT, driverBookingRoute);
app.use("/api/driver/profile", authenticateJWT, profileDriverRoute);

const server = http.createServer(app);

initSocket(server);

app.use(errorHandler);

mongoose
  .connect(process.env.MONGODB_URI!)
  .then(() => {
    console.log("MongoDB connected");
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
