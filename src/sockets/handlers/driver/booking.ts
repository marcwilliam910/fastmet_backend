import { Socket } from "socket.io";
import { CustomSocket } from "../../socket";

export const handleDriverDuty = (
  socket: CustomSocket,
  onDutyDrivers: Map<string, any>
) => {
  socket.on(
    "toggleDuty",
    ({
      isOnDuty,
      location,
    }: {
      isOnDuty: boolean;
      location: { lat: number; lng: number };
    }) => {
      if (isOnDuty) {
        onDutyDrivers.set(socket.userId, {
          socketId: socket.id,
          location,
          lastUpdate: new Date(),
        });
        console.log(`✅ Driver ${socket.userId} is now ON duty`);
        socket.emit("dutyStatusChanged", { isOnDuty: true });
      } else {
        onDutyDrivers.delete(socket.userId);
        console.log(`❌ Driver ${socket.userId} is now OFF duty`);
        socket.emit("dutyStatusChanged", { isOnDuty: false });
      }
    }
  );
};

// Driver updates location while on duty
export const handleDriverLocation = (
  socket: CustomSocket,
  onDutyDrivers: Map<string, any>
) => {
  socket.on("updateLocation", (location: { lat: number; lng: number }) => {
    const driver = onDutyDrivers.get(socket.userId);
    if (driver) {
      driver.location = location;
      driver.lastUpdate = new Date();
    }
  });
};
