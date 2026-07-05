import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";

export interface AuthRequest extends Request {
  userId?: string;
}

export async function auth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    const token = header.slice(7);

    let payload: { id: string };
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    } catch {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const user = await User.findById(payload.id);
    // Single-session enforcement: token must match the one stored in DB.
    if (!user || user.token !== token) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    req.userId = user.id;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
