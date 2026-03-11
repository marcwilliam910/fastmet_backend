import express from "express";
import cors from "cors";
import http from "http";
import dotenv from "dotenv";
dotenv.config();

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

// admin routes
import driverAdminRoute from "./routes/admin/driverRoute";

// for all
import vehicleRoute from "./routes/vehicleRoute";
import bookingTypeRoute from "./routes/bookingTypeRoute";

import { authenticateJWT } from "./middlewares/verifyToken";
import { shutdownWorkers, startWorkers } from "./workers/bootstrap";
import { syncIndexes } from "./scripts/syncIndexes";
import { populate } from "./migrate";

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1); // trust first proxy

// app.use((req, _res, next) => {
//   if (process.env.NODE_ENV !== "production") {
//     console.log("[IP Debug]", {
//       "req.ip": req.ip, // what Express resolves (what rate limiter uses)
//       "x-forwarded-for": req.headers["x-forwarded-for"], // raw header from proxy chain
//       "x-real-ip": req.headers["x-real-ip"], // some proxies set this instead
//     });
//   }
//   next();
// });

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
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

// admin routes
app.use("/api/admin/driver", driverAdminRoute);

app.use("/api/vehicles", vehicleRoute);
app.use("/api/booking-types", bookingTypeRoute);

const server = http.createServer(app);

initSocket(server);

app.use(errorHandler);

let isShuttingDown = false;
const handleShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Received ${signal}. Shutting down gracefully...`);
  await shutdownWorkers();

  server.close(async () => {
    await mongoose.connection.close();
    process.exit(0);
  });
};

const logMemoryUsage = () => {
  const mem = process.memoryUsage();

  console.log("[MEMORY]", {
    rss: (mem.rss / 1024 / 1024).toFixed(2) + " MB",
    heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2) + " MB",
    heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + " MB",
    external: (mem.external / 1024 / 1024).toFixed(2) + " MB",
    arrayBuffers: (mem.arrayBuffers / 1024 / 1024).toFixed(2) + " MB",
  });

  // TypeScript-safe way to access internal handles
  const anyProcess = process as any;
  if (typeof anyProcess._getActiveHandles === "function") {
    console.log("[ACTIVE HANDLES]", anyProcess._getActiveHandles().length);
  }
  if (typeof anyProcess._getActiveRequests === "function") {
    console.log("[ACTIVE REQUESTS]", anyProcess._getActiveRequests().length);
  }
};

process.on("SIGINT", () => {
  void handleShutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void handleShutdown("SIGTERM");
});

mongoose
  .connect(process.env.MONGODB_URI!, { maxPoolSize: 10 })
  .then(async () => {
    console.log("MongoDB connected");

    // await syncIndexes();
    // await populate();
    // await seedBookingTypes();

    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);

      const io = getIO();
      startWorkers(io);

      // setInterval(() => {
      //   logMemoryUsage();
      // }, 10000); // every 10 seconds

      // // Optional: log socket connections
      // setInterval(() => {
      //   console.log("[SOCKET CONNECTIONS]", io.engine.clientsCount);
      // }, 10000);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
