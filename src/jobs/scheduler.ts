import { rollRecurringBudgets } from "./recurringBudgets";
import { generateDueCharges } from "../services/subscriptionService";

export interface JobRunResult {
  budgetsCreated: number;
  chargesCreated: number;
}

// The scheduled unit of work, triggered by an external scheduler via
// POST /api/internal/run-jobs. Order matters: create any due recurring-budget
// periods first, so subscription charges have a budget period to land in,
// then generate subscription charges. Idempotent — safe to call repeatedly.
export async function runDailyJobs(now: Date = new Date()): Promise<JobRunResult> {
  const budgetsCreated = await rollRecurringBudgets(now);
  const chargesCreated = await generateDueCharges(now);
  return { budgetsCreated, chargesCreated };
}
