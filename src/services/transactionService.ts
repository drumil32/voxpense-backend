import { z } from "zod";
import { Transaction, ITransaction } from "../models/Transaction";
import { Budget, IBudget } from "../models/Budget";
import { CATEGORY_VALUES } from "../constants/categories";

// Input guardrail: shared by the REST controller and the AI agent tool.
export const addTransactionSchema = z.object({
  budgetId: z.string().min(1, "budgetId is required"),
  name: z.string().trim().min(1, "name is required").max(120),
  category: z.enum(CATEGORY_VALUES),
  amount: z.number().positive("amount must be greater than 0"),
  date: z.coerce.date().optional(),
});

export type AddTransactionInput = z.infer<typeof addTransactionSchema>;

// Patch guardrail for editing a past transaction. All fields optional, but
// at least one must be provided.
export const updateTransactionSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(120).optional(),
    category: z.enum(CATEGORY_VALUES).optional(),
    amount: z.number().positive("amount must be greater than 0").optional(),
    date: z.coerce.date().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export class TransactionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// Where a transaction came from. `transcript` is the raw voice text when
// the AI agent created it. Not part of the request-body schema so REST
// clients can't spoof source — only trusted server code passes meta.
export interface TransactionMeta {
  source?: "manual" | "agent" | "subscription";
  transcript?: string;
  subscriptionId?: string;
}

// Human label for a budget's period, e.g. "Jul 2026" (monthly) or "2026" (yearly).
function formatPeriod(budget: IBudget): string {
  const opts: Intl.DateTimeFormatOptions =
    budget.type === "monthly" ? { month: "short", year: "numeric" } : { year: "numeric" };
  return new Date(budget.startDate).toLocaleDateString("en-IN", opts);
}

// A transaction's date must fall inside its budget's period.
function assertDateInPeriod(date: Date, budget: IBudget): void {
  if (date < budget.startDate || date > budget.endDate) {
    throw new TransactionError(
      `Transaction date must be within this budget's period (${formatPeriod(budget)}).`
    );
  }
}

export async function addTransaction(
  userId: string,
  input: AddTransactionInput,
  meta?: TransactionMeta
): Promise<{ txn: ITransaction; budget: IBudget }> {
  const budget = await Budget.findOne({ _id: input.budgetId, userId });
  if (!budget) {
    throw new TransactionError("Budget not found", 404);
  }

  // Effective date is the provided date, else "now" (the model default).
  assertDateInPeriod(input.date ?? new Date(), budget);

  const txn = await Transaction.create({
    userId,
    budgetId: budget.id,
    budgetType: budget.type,
    name: input.name,
    category: input.category,
    amount: input.amount,
    date: input.date,
    source: meta?.source ?? "manual",
    transcript: meta?.transcript,
    subscriptionId: meta?.subscriptionId,
  });

  // $inc is atomic: the agent runs one add_transaction tool call per expense
  // and the SDK may execute them concurrently, so a read-modify-write here
  // loses updates.
  const updated = await Budget.findOneAndUpdate(
    { _id: budget._id },
    { $inc: { spent: input.amount } },
    { new: true }
  );

  return { txn, budget: updated ?? budget };
}

export async function updateTransaction(
  userId: string,
  txnId: string,
  patch: UpdateTransactionInput
): Promise<{ txn: ITransaction; budget: IBudget }> {
  const txn = await Transaction.findOne({ _id: txnId, userId });
  if (!txn) {
    throw new TransactionError("Transaction not found", 404);
  }

  const budget = await Budget.findOne({ _id: txn.budgetId, userId });
  if (!budget) {
    throw new TransactionError("Budget not found", 404);
  }

  if (patch.date !== undefined) {
    assertDateInPeriod(patch.date, budget);
  }

  if (patch.amount !== undefined) {
    const delta = patch.amount - txn.amount;
    budget.spent = Math.max(0, budget.spent + delta);
    txn.amount = patch.amount;
  }
  if (patch.name !== undefined) txn.name = patch.name;
  if (patch.category !== undefined) txn.category = patch.category;
  if (patch.date !== undefined) txn.date = patch.date;

  await txn.save();
  await budget.save();

  return { txn, budget };
}
