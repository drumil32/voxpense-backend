import { z } from "zod";
import { Types } from "mongoose";
import { Budget, IBudget } from "../models/Budget";
import { TransactionError } from "./transactionService";

// Patch guardrail for editing a budget. name, amount and recurring are editable.
// type, startDate, endDate and spent must NOT be changed here.
export const updateBudgetSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(120).optional(),
    amount: z.number().positive("amount must be greater than 0").optional(),
    recurring: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;

export async function updateBudget(
  userId: string,
  budgetId: string,
  patch: UpdateBudgetInput
): Promise<IBudget> {
  const budget = await Budget.findOne({ _id: budgetId, userId });
  if (!budget) {
    throw new TransactionError("Budget not found", 404);
  }

  if (patch.name !== undefined) budget.name = patch.name;
  if (patch.amount !== undefined) budget.amount = patch.amount;

  if (patch.recurring !== undefined) {
    budget.recurring = patch.recurring;
    // Turning recurring on for a one-off budget makes it head its own series.
    if (patch.recurring && !budget.seriesId) {
      budget.seriesId = budget._id as Types.ObjectId;
    }
  }

  await budget.save();

  return budget;
}
