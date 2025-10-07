// import {Request, Response, NextFunction} from "express";
// import admin from "../config/firebase"; // your Firebase Admin setup

// export const verifyFirebaseToken = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   const authHeader = req.headers.authorization;
//   if (!authHeader || !authHeader.startsWith("Bearer ")) {
//     return res.status(401).json({message: "No token provided"});
//   }

//   const token = authHeader.split(" ")[1];
//   try {
//     const decodedToken = await admin.auth().verifyIdToken(token);
//     (req as any).user = decodedToken; // attach user info to request
//     next();
//   } catch (err) {
//     console.error("Token verification failed:", err);
//     return res.status(401).json({message: "Invalid or expired token"});
//   }
// };
