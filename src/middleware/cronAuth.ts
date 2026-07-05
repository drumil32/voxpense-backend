import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

// Guards internal job endpoints. The caller (an external scheduler) must send
// `x-cron-secret: <CRON_SECRET>`. This is a shared service secret — NOT a user JWT.
export function cronAuth(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ success: false, error: "CRON_SECRET is not configured" });
  }

  const provided = req.header("x-cron-secret") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // Constant-time compare; length mismatch is an automatic fail.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  next();
}
