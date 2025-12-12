import { Server, Socket } from "socket.io";
import {
  getDriverLocation,
  handleBookingSocket,
} from "./handlers/client/booking";
import { acceptBooking, driverLocation } from "./handlers/driver/booking";
import {
  setDriverAvailable,
  toggleOnDuty,
  updateDriverLocation,
} from "./handlers/driver/duty";
import jwt from "jsonwebtoken";
import { SOCKET_ROOMS } from "../utils/constants";
import { chatHandler } from "./handlers/chat";

// Extend Socket type to include custom properties
export interface CustomSocket extends Socket {
  userId: string;
  userType: "driver" | "client";
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

      socket.userId = decoded.id;
      socket.userType = decoded.userType;
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", async (s) => {
    const socket = s as CustomSocket;
    console.log(
      `New ${socket.userType} connected: ${socket.id} (User: ${socket.userId})`
    );

    // Join user's personal room (for targeted emissions)
    socket.join(socket.userId);

    chatHandler(socket, io);

    // Driver-specific handlers
    if (socket.userType === "driver") {
      toggleOnDuty(socket);
      updateDriverLocation(socket);
      acceptBooking(socket, io);
      driverLocation(socket, io);
      setDriverAvailable(socket);
    }

    // Client-specific handlers
    if (socket.userType === "client") {
      handleBookingSocket(socket, io);
      getDriverLocation(socket, io);
    }

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
    });
  });

  // ✅ Log stats periodically
  // setInterval(async () => {
  //   const onDutySockets = await io.in(SOCKET_ROOMS.ON_DUTY).fetchSockets();
  //   const availableSockets = await io.in(SOCKET_ROOMS.AVAILABLE).fetchSockets();

  //   console.log(`📊 On-duty drivers: ${onDutySockets.length}`);
  //   console.log(`📊 Available drivers: ${availableSockets.length}`);
  // }, 30000); // Every 30 seconds

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized!");
  return io;
};
