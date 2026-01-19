import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { errorHandler } from "./middlewares/errorHandler";
import { getIO, initSocket } from "./sockets/socket";
// client routes
import bookingRoute from "./routes/client/bookingRoute";
import profileClientRoute from "./routes/client/profileRoute";
import authClientRoute from "./routes/client/authRoute";
import conversationClientRoute from "./routes/client/conversationRoute";
import notificationClientRoutes from "./routes/client/notificationRoute";
// driver routes
import driverBookingRoute from "./routes/driver/bookingRoute";
import authDriverRoute from "./routes/driver/authRoute";
import conversationDriverRoute from "./routes/driver/conversationRoute";
import profileDriverRoute from "./routes/driver/profileRoute";
import notificationDriverRoutes from "./routes/driver/notificationRoute";

// for all
import vehicleRoute from "./routes/vehicleRoute";

import { authenticateJWT } from "./middlewares/verifyToken";
import { startNotificationCron } from "./services/notificationCron";
import { migrateVehicleServicesV2 } from "./migrate";
import { startBookingCleanupCron } from "./services/bookingCleanupCron";
import { restoreBookingTimers } from "./utils/helpers/timerCleanup";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/client/auth", authClientRoute);
app.use("/api/client/profile", authenticateJWT, profileClientRoute);
app.use("/api/client/booking", authenticateJWT, bookingRoute);
app.use("/api/client/message", authenticateJWT, conversationClientRoute);
app.use("/api/client/notifications", authenticateJWT, notificationClientRoutes);

app.use("/api/driver/auth", authDriverRoute);
app.use("/api/driver/booking", authenticateJWT, driverBookingRoute);
app.use("/api/driver/profile", authenticateJWT, profileDriverRoute);
app.use("/api/driver/message", authenticateJWT, conversationDriverRoute);
app.use("/api/driver/notifications", authenticateJWT, notificationDriverRoutes);

app.use("/api/vehicles", vehicleRoute);

const server = http.createServer(app);

initSocket(server);

app.use(errorHandler);

mongoose
  .connect(process.env.MONGODB_URI!)
  .then(async () => {
    console.log("MongoDB connected");

    // await migrateVehicleServicesV2();
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);

      // ✅ Start cron AFTER MongoDB is connected and server is listening
      // startNotificationCron();
      // console.log("⏰ Notification cron job initialized");

      // startTestNotificationCron();

      const io = getIO();
      startBookingCleanupCron(io);
      restoreBookingTimers(io);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
