import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { AuthRequest } from "../middleware/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signup(req: Request, res: Response) {
  try {
    const { email, password, confirmPassword } = req.body as {
      email?: string;
      password?: string;
      confirmPassword?: string;
    };

    if (!email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, error: "Invalid email" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: "Passwords do not match" });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ success: false, error: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await User.create({ email: email.toLowerCase(), passwordHash });

    return res.status(201).json({ success: true, message: "Account created" });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function signin(req: Request, res: Response) {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, error: "Invalid credentials" });
    }

    // Infinite-expiry JWT, stored in DB. New login overwrites old token (single session).
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET as string);
    user.token = token;
    await user.save();

    return res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function logout(req: AuthRequest, res: Response) {
  try {
    await User.findByIdAndUpdate(req.userId, { token: null });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function me(req: AuthRequest, res: Response) {
  const user = await User.findById(req.userId).select("email");
  if (!user) return res.status(401).json({ success: false, error: "Unauthorized" });
  return res.json({ success: true, user: { id: user.id, email: user.email } });
}
