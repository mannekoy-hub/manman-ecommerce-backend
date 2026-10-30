import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

interface AuthRequest extends Request {
  userId?: string | number;
}

function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== "string") {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    return res.status(500).json({ message: "JWT secret is not configured" });
  }

  jwt.verify(token, jwtSecret, (error, decoded) => {
    if (error || !decoded || typeof decoded !== "object" || !("id" in decoded)) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.userId = decoded.id as string | number;
    next();
  });
}

export default authMiddleware;