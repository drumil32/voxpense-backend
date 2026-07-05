import mongoose, { Schema, Document, Types } from "mongoose";

export type BudgetType = "monthly" | "yearly";

export interface IBudget extends Document {
  userId: Types.ObjectId;
  name: string;
  type: BudgetType;
  startDate: Date;
  endDate: Date;
  amount: number;
  spent: number;
  recurring: boolean;
  // Links every period of one recurring budget. For a recurring budget this is
  // set to the first budget's _id; successors share it. Null for one-off budgets.
  seriesId: Types.ObjectId | null;
}

const budgetSchema = new Schema<IBudget>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["monthly", "yearly"], required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    spent: { type: Number, default: 0, min: 0 },
    recurring: { type: Boolean, default: false },
    seriesId: { type: Schema.Types.ObjectId, ref: "Budget", default: null, index: true },
  },
  { timestamps: true }
);

export const Budget = mongoose.model<IBudget>("Budget", budgetSchema);
