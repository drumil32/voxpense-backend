import cron from "node-cron";
import { rollRecurringBudgets } from "./recurringBudgets";
import { generateDueCharges } from "../services/subscriptionService";

// Order matters: create any due recurring-budget periods first, so subscription
// charges have a budget period to land in, then generate subscription charges.
export async function runDailyJobs(now: Date = new Date()): Promise<void> {
  await rollRecurringBudgets(now);
  await generateDueCharges(now);
}

export function scheduleDailyJobs(): void {
  // Every day at 00:05 (server local time).
  cron.schedule("5 0 * * *", () => {
    runDailyJobs().catch((e) => console.error("[scheduler] cron error:", e));
  });
}
