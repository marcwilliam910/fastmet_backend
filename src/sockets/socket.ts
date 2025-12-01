import { Server, Socket } from "socket.io";
import {
  getDriverLocation,
  handleBookingSocket,
} from "./handlers/client/booking";
import { on } from "events";
import { acceptBooking, driverLocation } from "./handlers/driver/booking";
import { toggleOnDuty, updateDriverLocation } from "./handlers/driver/duty";
import { SOCKET_ROOMS } from "../constants/socketRooms";

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
  });

  // Middleware for authentication
  io.use((s, next) => {
    const socket = s as CustomSocket;

    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      // TODO: Verify JWT token
      // const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // socket.userId = decoded.userId;
      // socket.userType = decoded.userType;

      // For now, using query params (replace with JWT)
      socket.userId = socket.handshake.query.userId as string;
      socket.userType = socket.handshake.query.userType as "driver" | "client";

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

    // Driver-specific handlers
    if (socket.userType === "driver") {
      socket.join(socket.userId);
      toggleOnDuty(socket);
      updateDriverLocation(socket);
      acceptBooking(socket, io);
      driverLocation(socket, io);
    }

    // Client-specific handlers
    if (socket.userType === "client") {
      socket.join(socket.userId);
      handleBookingSocket(socket, io);
      getDriverLocation(socket, io);
    }

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  // ✅ Log stats periodically
  setInterval(async () => {
    const onDutySockets = await io.in(SOCKET_ROOMS.ON_DUTY).fetchSockets();
    const availableSockets = await io.in(SOCKET_ROOMS.AVAILABLE).fetchSockets();

    console.log(`📊 On-duty drivers: ${onDutySockets.length}`);
    console.log(`📊 Available drivers: ${availableSockets.length}`);
  }, 30000); // Every 30 seconds

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized!");
  return io;
};
