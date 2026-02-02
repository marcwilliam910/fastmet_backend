import { Socket } from "socket.io";

// A wrapper for async socket handlers
export const withErrorHandling = (socket: Socket) => {
  return <T = any>(
    eventName: string,
    handler: (data: T) => Promise<void> | void,
  ) => {
    socket.on(eventName, async (data: T) => {
      try {
        await handler(data);
      } catch (error: any) {
        // ADD THESE LINES - Force log to console
        console.error(`❌❌❌ [${eventName}] Error caught:`, error);
        console.error("Error stack:", error.stack);
        console.error("Error details:", JSON.stringify(error, null, 2));

        socket.emit("error", {
          event: eventName,
          message: error.message || "An unexpected error occurred",
          code: error.code || "SOCKET_ERROR",
        });
      }
    });
  };
};
