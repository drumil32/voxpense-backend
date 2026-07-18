import mongoose, { Schema, Document, Types } from "mongoose";

// A pending agent question — at most ONE per user (unique userId). When the
// agent asks a clarifying question, the OpenAI response id is stored here so
// the user's next message continues that thread via previousResponseId.
// A follow-up question overwrites the row; a completed/abandoned exchange
// deletes it. Reads must still check expiresAt themselves because Mongo's TTL
// sweep only runs about once a minute.
export interface IAgentConversation extends Document {
  userId: Types.ObjectId;
  budgetId: Types.ObjectId;
  lastResponseId: string;
  expiresAt: Date;
}

const agentConversationSchema = new Schema<IAgentConversation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    budgetId: { type: Schema.Types.ObjectId, ref: "Budget", required: true },
    lastResponseId: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

agentConversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AgentConversation = mongoose.model<IAgentConversation>(
  "AgentConversation",
  agentConversationSchema
);
