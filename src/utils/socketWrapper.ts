import { Socket } from "socket.io";

// A wrapper for async socket handlers
export const withErrorHandling = (socket: Socket) => {
  return <T = any>(
    eventName: string,
    handler: (data: T) => Promise<void> | void
  ) => {
    socket.on(eventName, async (data: T) => {
      try {
        await handler(data);
      } catch (error: any) {
        console.error(`[${eventName}] Error:`, error);

        socket.emit("error", {
          event: eventName,
          message: error.message || "An unexpected error occurred",
          code: error.code || "SOCKET_ERROR",
        });
      }
    });
  };
};
