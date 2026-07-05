// TODO: Replace the in-process node-cron scheduler with an external trigger.
// Plan: expose `rollRecurringBudgets()` behind a protected API endpoint
// (e.g. POST /api/internal/roll-recurring, guarded by a secret/service token),
// and run a separate lightweight "scheduler" server whose only job is to call
// that endpoint on a schedule. This decouples scheduling from the app process
// so it survives app restarts/scaling and can be run/monitored independently.
// Until then, node-cron below handles it in-process.
import cron from "node-cron";
import { Budget } from "../models/Budget";
import { nextPeriod } from "../utils/period";

// Roll every recurring series forward so its latest period covers today.
// Runs on boot (catch-up after downtime) and daily via cron. Idempotent:
// it dedupes on (seriesId, startDate), so repeated runs never duplicate.
export async function rollRecurringBudgets(now: Date = new Date()): Promise<number> {
  let created = 0;

  const seriesIds = await Budget.distinct("seriesId", { seriesId: { $ne: null } });

  for (const sid of seriesIds) {
    let latest = await Budget.findOne({ seriesId: sid }).sort({ endDate: -1 });
    if (!latest || !latest.recurring) continue;

    let guard = 0;
    while (latest.endDate < now && guard < 500) {
      guard++;
      const { startDate, endDate } = nextPeriod(latest.type, latest.startDate);

      const existing = await Budget.findOne({ seriesId: sid, startDate });
      if (existing) {
        latest = existing;
        continue;
      }

      latest = await Budget.create({
        userId: latest.userId,
        name: latest.name,
        type: latest.type,
        startDate,
        endDate,
        amount: latest.amount,
        spent: 0,
        recurring: true,
        seriesId: sid,
      });
      created++;
    }
  }

  if (created > 0) console.log(`[recurring] created ${created} budget(s)`);
  return created;
}

export function scheduleRecurringBudgets(): void {
  // Every day at 00:05 (server local time).
  cron.schedule("5 0 * * *", () => {
    rollRecurringBudgets().catch((e) => console.error("[recurring] cron error:", e));
  });
}
