declare namespace Express {
  interface Request {
    user?: {
      driverId?: string;
      clientId?: string;
      phoneNumber: string;
      userType: "driver" | "client";
    };
  }
}
