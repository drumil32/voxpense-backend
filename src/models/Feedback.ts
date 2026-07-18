import mongoose, { Schema, Document, Types } from "mongoose";

// Silent user feedback on AI-added transactions. Never rendered in the UI —
// collected purely so we can analyse how well the agent is doing later.
// One doc per transaction; a batch (one voice message adding N txns) creates
// N docs sharing the same rating/voice note. Feedback is one-shot: txnId is
// unique, and the controller rejects a second submission instead of updating.
// batchId is shared by every doc created from one feedback submission, so the
// txns rated together can be grouped back.
export interface IFeedback extends Document {
  userId: Types.ObjectId;
  txnId: Types.ObjectId;
  batchId: Types.ObjectId;
  rating: "like" | "dislike";
  voiceTranscript: string | null;
}

const feedbackSchema = new Schema<IFeedback>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    txnId: { type: Schema.Types.ObjectId, ref: "Transaction", required: true, unique: true },
    batchId: { type: Schema.Types.ObjectId, required: true, index: true },
    rating: { type: String, enum: ["like", "dislike"], required: true },
    voiceTranscript: { type: String, default: null },
  },
  { timestamps: true }
);

export const Feedback = mongoose.model<IFeedback>("Feedback", feedbackSchema);
