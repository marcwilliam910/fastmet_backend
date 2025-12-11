declare namespace Express {
  interface Request {
    user?: {
      id: string;
      phoneNumber: string;
      userType: "driver" | "client";
    };
  }
}
