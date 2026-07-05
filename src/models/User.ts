import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  token: string | null;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    token: { type: String, default: null },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", userSchema);
