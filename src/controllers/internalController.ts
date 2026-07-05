import { Request, Response } from "express";
import { runDailyJobs } from "../jobs/scheduler";

// Runs the scheduled work (roll recurring budgets forward + generate due
// subscription charges) once. Safe to call repeatedly — the underlying jobs
// are idempotent. Intended to be hit by an external scheduler on a cadence.
export async function runJobs(_req: Request, res: Response) {
  try {
    const result = await runDailyJobs();
    console.log(
      `[internal] run-jobs: budgetsCreated=${result.budgetsCreated} chargesCreated=${result.chargesCreated}`
    );
    return res.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Job run failed";
    console.error("[internal] run-jobs error:", message);
    return res.status(500).json({ success: false, error: message });
  }
}
