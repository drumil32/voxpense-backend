import { Response } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { AuthRequest } from "../middleware/auth";
import { Feedback } from "../models/Feedback";
import { Transaction } from "../models/Transaction";
import { transcribeBuffer } from "./aiController";

const createFeedbackSchema = z.object({
  txnIds: z.array(z.string().min(1)).min(1, "txnIds is required").max(50),
  rating: z.enum(["like", "dislike"]),
});

// Record a like/dislike for AI-added transactions. Feedback is one-shot: once
// any of these txns has feedback, a new submission is rejected.
export async function createFeedback(req: AuthRequest, res: Response) {
  try {
    const parsed = createFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" });
    }
    const { txnIds, rating } = parsed.data;

    // Only accept transactions that exist and belong to this user.
    const owned = await Transaction.find({ _id: { $in: txnIds }, userId: req.userId }).select("_id");
    if (owned.length === 0) {
      return res.status(404).json({ success: false, error: "Transactions not found" });
    }

    const ownedIds = owned.map((t) => t._id);
    const existing = await Feedback.countDocuments({ txnId: { $in: ownedIds } });
    if (existing > 0) {
      return res.status(409).json({ success: false, error: "Feedback already given" });
    }

    // One id per submission, shared by every doc it creates, so the txns that
    // were rated together can be grouped back later.
    const batchId = new Types.ObjectId();

    try {
      await Feedback.insertMany(
        ownedIds.map((txnId) => ({ userId: req.userId, txnId, batchId, rating }))
      );
    } catch (err) {
      // The unique txnId index is the real one-shot guard (covers the race
      // where two submissions pass the countDocuments check together).
      if (err instanceof Error && err.message.includes("E11000")) {
        return res.status(409).json({ success: false, error: "Feedback already given" });
      }
      throw err;
    }
    return res.status(201).json({ success: true, count: ownedIds.length, batchId });
  } catch (err) {
    console.error("[feedback] error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

// Optional voice note attached to an existing rating. Audio is transcribed
// server-side and only the transcript is stored, on every feedback doc of the
// batch (txnIds echoes the ones just rated).
export async function addVoiceFeedback(req: AuthRequest, res: Response) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: "No audio file provided" });
    }

    let txnIds: unknown;
    try {
      txnIds = JSON.parse((req.body?.txnIds as string) || "[]");
    } catch {
      txnIds = [];
    }
    if (!Array.isArray(txnIds) || txnIds.length === 0 || !txnIds.every((id) => typeof id === "string")) {
      return res.status(400).json({ success: false, error: "txnIds is required" });
    }

    const text = (await transcribeBuffer(file)).trim();
    let updated = 0;
    if (text) {
      // Attach-once: an existing transcript is never overwritten, matching
      // the one-shot rule for the rating itself.
      const result = await Feedback.updateMany(
        { userId: req.userId, txnId: { $in: txnIds }, voiceTranscript: null },
        { voiceTranscript: text }
      );
      updated = result.modifiedCount;
    }
    return res.json({ success: true, transcript: text, updated });
  } catch (err) {
    console.error("[feedback voice] error:", err instanceof Error ? err.message : err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
