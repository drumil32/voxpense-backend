import mongoose, { Schema, Document, Types } from "mongoose";

export const FREQUENCIES = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface ISubscription extends Document {
  userId: Types.ObjectId;
  budgetId: Types.ObjectId; // budget selected when the subscription was created
  seriesId: Types.ObjectId | null; // budget series, if the budget is recurring
  name: string;
  category: string;
  amount: number;
  frequency: Frequency;
  startDate: Date;
  endDate: Date;
  nextRunDate: Date; // next charge date to generate
  active: boolean;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    budgetId: { type: Schema.Types.ObjectId, ref: "Budget", required: true, index: true },
    seriesId: { type: Schema.Types.ObjectId, ref: "Budget", default: null, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    frequency: { type: String, enum: FREQUENCIES, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    nextRunDate: { type: Date, required: true, index: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export const Subscription = mongoose.model<ISubscription>("Subscription", subscriptionSchema);
