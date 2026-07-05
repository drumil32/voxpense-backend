import { z } from "zod";
import { Types } from "mongoose";
import { Subscription, ISubscription, FREQUENCIES } from "../models/Subscription";
import { Budget, IBudget } from "../models/Budget";
import { CATEGORY_VALUES } from "../constants/categories";
import { advanceByFrequency } from "../utils/period";
import { addTransaction, TransactionError } from "./transactionService";

export const createSubscriptionSchema = z.object({
  budgetId: z.string().min(1, "budgetId is required"),
  name: z.string().trim().min(1, "name is required").max(120),
  category: z.enum(CATEGORY_VALUES),
  amount: z.number().positive("amount must be greater than 0"),
  frequency: z.enum(FREQUENCIES),
  startDate: z.coerce.date().optional(), // defaults to today
  endDate: z.coerce.date(),
});

export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

function periodLabel(budget: IBudget): string {
  const opts: Intl.DateTimeFormatOptions =
    budget.type === "monthly" ? { month: "short", year: "numeric" } : { year: "numeric" };
  return new Date(budget.startDate).toLocaleDateString("en-IN", opts);
}

// Find the budget that a charge on `date` should land in.
// Recurring budget -> the series period covering the date; otherwise the origin budget.
async function findBudgetForDate(
  userId: string,
  sub: Pick<ISubscription, "budgetId" | "seriesId">,
  date: Date
): Promise<IBudget | null> {
  if (sub.seriesId) {
    return Budget.findOne({
      userId,
      seriesId: sub.seriesId,
      startDate: { $lte: date },
      endDate: { $gte: date },
    });
  }
  return Budget.findOne({ _id: sub.budgetId, userId });
}

/**
 * Create a subscription (after validating it against the target budget) and
 * immediately generate its first charge. Returns the subscription plus the
 * first transaction/budget so the UI can update.
 */
export async function createSubscription(userId: string, input: CreateSubscriptionInput) {
  const budget = await Budget.findOne({ _id: input.budgetId, userId });
  if (!budget) {
    throw new TransactionError("Budget not found", 404);
  }

  const start = input.startDate ?? new Date();
  const end = input.endDate;

  if (end < start) {
    throw new TransactionError("End date must be after the start date");
  }
  // The first charge must fall inside the selected budget's period.
  if (start < budget.startDate || start > budget.endDate) {
    throw new TransactionError(
      `The start date must be within this budget's period (${periodLabel(budget)}).`
    );
  }

  // The crux rule: if the subscription runs past this budget's period, the
  // budget must be recurring so future periods exist for the later charges.
  if (end > budget.endDate && !budget.recurring) {
    throw new TransactionError(
      `This budget isn't recurring, so a subscription can't run past ${periodLabel(budget)}. ` +
        `Make the budget recurring, or set the end date within this period.`
    );
  }

  const sub = await Subscription.create({
    userId,
    budgetId: budget._id,
    seriesId: budget.recurring ? budget.seriesId : null,
    name: input.name,
    category: input.category,
    amount: input.amount,
    frequency: input.frequency,
    startDate: start,
    endDate: end,
    nextRunDate: start,
    active: true,
  });

  // Generate the first charge (and any already-due ones) right away.
  const { created } = await generateForSubscription(sub);

  return { subscription: sub, firstCharge: created[0] ?? null };
}

export interface GeneratedCharge {
  txnId: string;
  budgetId: string;
  date: Date;
  amount: number;
}

/**
 * Generate all due charges for a single subscription up to `now`, advancing
 * nextRunDate each time. Deactivates the subscription once it passes endDate.
 */
export async function generateForSubscription(
  sub: ISubscription,
  now: Date = new Date()
): Promise<{ created: GeneratedCharge[] }> {
  const created: GeneratedCharge[] = [];
  let guard = 0;

  while (sub.active && sub.nextRunDate <= now && guard < 1000) {
    guard++;

    if (sub.nextRunDate > sub.endDate) {
      sub.active = false; // completed
      break;
    }

    const chargeDate = sub.nextRunDate;
    const targetBudget = await findBudgetForDate(sub.userId.toString(), sub, chargeDate);

    // Period budget not created yet (recurring roll-forward pending) — stop and
    // retry on the next run once the budget exists.
    if (!targetBudget) break;

    const { txn } = await addTransaction(
      sub.userId.toString(),
      {
        budgetId: targetBudget._id as Types.ObjectId as unknown as string,
        name: sub.name,
        category: sub.category as (typeof CATEGORY_VALUES)[number],
        amount: sub.amount,
        date: chargeDate,
      },
      { source: "subscription", subscriptionId: (sub._id as Types.ObjectId).toString() }
    );

    created.push({
      txnId: (txn._id as Types.ObjectId).toString(),
      budgetId: targetBudget.id,
      date: chargeDate,
      amount: sub.amount,
    });

    sub.nextRunDate = advanceByFrequency(chargeDate, sub.frequency);
    if (sub.nextRunDate > sub.endDate) sub.active = false;
  }

  await sub.save();
  return { created };
}

// Run generation across every active subscription (used by the cron/boot job).
export async function generateDueCharges(now: Date = new Date()): Promise<number> {
  let total = 0;
  const subs = await Subscription.find({ active: true, nextRunDate: { $lte: now } });
  for (const sub of subs) {
    const { created } = await generateForSubscription(sub, now);
    total += created.length;
  }
  if (total > 0) console.log(`[subscriptions] generated ${total} charge(s)`);
  return total;
}

export async function listSubscriptions(userId: string, budgetId?: string): Promise<ISubscription[]> {
  const filter: Record<string, unknown> = { userId };
  if (budgetId) {
    // Show subscriptions tied to this budget OR to its recurring series.
    const budget = await Budget.findOne({ _id: budgetId, userId });
    if (budget?.seriesId) {
      filter.$or = [{ budgetId }, { seriesId: budget.seriesId }];
    } else {
      filter.budgetId = budgetId;
    }
  }
  return Subscription.find(filter).sort({ createdAt: -1 });
}

export async function cancelSubscription(userId: string, id: string): Promise<ISubscription> {
  const sub = await Subscription.findOne({ _id: id, userId });
  if (!sub) {
    throw new TransactionError("Subscription not found", 404);
  }
  sub.active = false;
  await sub.save();
  return sub;
}

// Editable fields. name/category/amount/frequency affect future charges only;
// past transactions are left untouched. startDate is fixed once created.
export const updateSubscriptionSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(120).optional(),
    category: z.enum(CATEGORY_VALUES).optional(),
    amount: z.number().positive("amount must be greater than 0").optional(),
    frequency: z.enum(FREQUENCIES).optional(),
    endDate: z.coerce.date().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;

export async function updateSubscription(
  userId: string,
  id: string,
  patch: UpdateSubscriptionInput
): Promise<ISubscription> {
  const sub = await Subscription.findOne({ _id: id, userId });
  if (!sub) {
    throw new TransactionError("Subscription not found", 404);
  }

  const budget = await Budget.findOne({ _id: sub.budgetId, userId });
  if (!budget) {
    throw new TransactionError("Budget not found", 404);
  }

  const newEnd = patch.endDate ?? sub.endDate;
  if (newEnd < sub.startDate) {
    throw new TransactionError("End date must be after the start date");
  }
  // Same rule as creation: extending past the budget's period needs a recurring budget.
  if (newEnd > budget.endDate && !budget.recurring) {
    throw new TransactionError(
      `This budget isn't recurring, so a subscription can't run past ${periodLabel(budget)}. ` +
        `Make the budget recurring, or set the end date within this period.`
    );
  }
  // If the budget became recurring after creation, link the series now.
  if (budget.recurring && !sub.seriesId) {
    sub.seriesId = budget.seriesId;
  }

  if (patch.name !== undefined) sub.name = patch.name;
  if (patch.category !== undefined) sub.category = patch.category;
  if (patch.amount !== undefined) sub.amount = patch.amount;
  if (patch.frequency !== undefined) sub.frequency = patch.frequency;
  if (patch.endDate !== undefined) sub.endDate = patch.endDate;

  // If the (possibly new) end date is now before the next scheduled charge, it's done.
  if (sub.active && sub.nextRunDate > sub.endDate) sub.active = false;

  await sub.save();
  return sub;
}
