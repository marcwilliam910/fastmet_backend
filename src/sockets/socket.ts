import { Server, Socket } from "socket.io";
import {
  cancelBooking,
  getDriverLocation,
  pickDriver,
  requestAsapBooking,
  requestScheduleBooking,
  asapTimerEnd,
  requestPoolingBooking,
} from "./handlers/client/booking";
import {
  arrivedAtPickup,
  cancelOffer,
  // acceptBooking,
  driverLocation,
  handleStartScheduledTrip,
  requestAcceptance,
  startDriving,
  updateDriverState,
} from "./handlers/driver/booking";
import {
  setDriverAvailable,
  toggleOnDuty,
  updateDriverLocation,
} from "./handlers/driver/duty";
import jwt from "jsonwebtoken";
import { chatHandler } from "./handlers/chat";
import mongoose, { Schema } from "mongoose";

// Extend Socket type to include custom data properties
export interface CustomSocket extends Socket {
  data: {
    userId: string;
    userType: "driver" | "client";
    location?: { lat: number; lng: number };
    vehicleType?: string;
    serviceAreas: string[];
    vehicle: mongoose.Types.ObjectId;
    vehicleVariant: mongoose.Types.ObjectId;
  };
}

let io: Server;

export const initSocket = (server: any) => {
  io = new Server(server, {
    cors: {
      origin: "*", // or your client URL
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"], // Add this for better compatibility
    // connectionStateRecovery: {
    //   maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    //   skipMiddlewares: false,
    // },
    // pingInterval: 60000,
    // pingTimeout: 5000,
  });

  // Middleware for authentication
  io.use((s, next) => {
    const socket = s as CustomSocket;

    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        id: string;
        phoneNumber: string;
        userType: "driver" | "client";
      };

      // Store in socket.data so it's accessible via fetchSockets() (RemoteSocket)
      socket.data.userId = decoded.id;
      socket.data.userType = decoded.userType;
      next();
    } catch (err: any) {
      console.log("❌ JWT Error:", err.message); // ADD THIS
      console.log("Token that failed:", token.substring(0, 50) + "..."); // ADD THIS
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", async (s) => {
    const socket = s as CustomSocket;
    console.log(
      `New ${socket.data.userType} connected: ${socket.id} (User: ${socket.data.userId})`,
    );

    // Join user's personal room (for targeted emissions)
    socket.join(socket.data.userId);

    chatHandler(socket, io);

    // Driver-specific handlers
    if (socket.data.userType === "driver") {
      toggleOnDuty(socket);
      updateDriverLocation(socket);
      // acceptBooking(socket, io);
      driverLocation(socket, io);
      setDriverAvailable(socket);
      handleStartScheduledTrip(socket);
      requestAcceptance(socket, io);
      cancelOffer(socket, io);
      startDriving(socket);
      arrivedAtPickup(socket);
      updateDriverState(socket);
    }

    // Client-specific handlers
    if (socket.data.userType === "client") {
      requestAsapBooking(socket, io);
      requestScheduleBooking(socket, io);
      requestPoolingBooking(socket, io);
      getDriverLocation(socket, io);
      pickDriver(socket, io);
      cancelBooking(socket, io);
      asapTimerEnd(socket, io);
    }

    socket.on("disconnect", () => {
      console.log(`${socket.data.userType} disconnected: ${socket.id}`);
      socket.removeAllListeners(); // ✅ safety net
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized!");
  return io;
};
