import { Server, Socket } from "socket.io";
import { handleBookingSocket } from "./handlers/client/booking";
import { on } from "events";
import {
  handleDriverDuty,
  handleDriverLocation,
} from "./handlers/driver/booking";

// Extend Socket type to include custom properties
export interface CustomSocket extends Socket {
  userId: string;
  userType: "driver" | "client";
}

// In-memory Map to track on-duty drivers - or redis
const onDutyDrivers = new Map<
  string,
  {
    socketId: string;
    location: { lat: number; lng: number };
    lastUpdate: Date;
  }
>();

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
      // socket.userType = decoded.userType; // 'driver' or 'client'

      // For now, using query params (replace with JWT)
      socket.userId = socket.handshake.query.userId as string;
      socket.userType = socket.handshake.query.userType as "driver" | "client";

      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (s) => {
    const socket = s as CustomSocket;
    console.log(
      `New ${socket.userType} connected: ${socket.id} (User: ${socket.userId})`
    );

    // Driver-specific handlers
    if (socket.userType === "driver") {
      handleDriverDuty(socket, onDutyDrivers);
      handleDriverLocation(socket, onDutyDrivers);
    }

    // Client-specific handlers
    if (socket.userType === "client") {
      handleBookingSocket(socket, io);
      // handleMessageSocket(socket, io);
    }

    socket.on("disconnect", () => {
      console.log(`Client disconnected: ${socket.id}`);

      // Auto off-duty when driver disconnects
      if (socket.userType === "driver") {
        onDutyDrivers.delete(socket.userId);
        console.log(`Driver ${socket.userId} auto OFF duty (disconnected)`);
      }
    });
  });

  // Stale driver cleanup (safety net)
  setInterval(() => {
    const now = Date.now();
    for (const [driverId, driver] of onDutyDrivers.entries()) {
      if (now - driver.lastUpdate.getTime() > 5 * 60 * 1000) {
        // 5 min
        onDutyDrivers.delete(driverId);
        console.log(`Removed stale driver ${driverId}`);
      }
    }
  }, 60000); // Check every minute

  // Log stats
  setInterval(() => {
    console.log(`📊 Active on-duty drivers: ${onDutyDrivers.size}`);
  }, 30000);

  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized!");
  return io;
};
