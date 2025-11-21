import { Socket, Server } from "socket.io";
import BookingModel from "../../../models/Booking";

export const handleBookingSocket = (socket: Socket, io: Server) => {
  socket.on("request_booking", async (data) => {
    console.log("Booking request received:", JSON.stringify(data, null, 2));

    try {
      // 1. Save booking to DB
      const booking = await BookingModel.create({
        ...data,
        status: "pending",
      });

      // 2. Prepare payload for drivers
      const driverPayload = {
        _id: booking._id,
        pickUp: booking.pickUp,
        dropOff: booking.dropOff,
        bookingType: booking.bookingType,
        routeData: booking.routeData,
        selectedVehicle: booking.selectedVehicle,
        addedServices: booking.addedServices,
        paymentMethod: booking.paymentMethod,
      };

      // 3. Emit to drivers (can later filter by nearest driver)
      io.emit("new_booking_request", driverPayload);
    } catch (err) {
      console.error("Error saving booking:", err);
      socket.emit("booking_error", { message: "Failed to request booking" });
    }
  });
};
