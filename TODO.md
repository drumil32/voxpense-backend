# TODO

## Move recurring scheduling out of the app process
Currently `src/jobs/scheduler.ts` (via `src/jobs/recurringBudgets.ts` and `src/services/subscriptionService.ts`) uses **node-cron** in-process (daily + on boot) to roll recurring budgets forward and generate due subscription charges.

**Planned change:** replace node-cron with an API-triggered flow.
- Expose the existing `runDailyJobs()` logic behind a protected endpoint, e.g. `POST /api/internal/run-jobs`, guarded by a shared secret / service token (not user JWT).
- Stand up a **separate scheduler server** whose only responsibility is to call that endpoint on a schedule.
- Remove the in-process `node-cron` schedule once the external scheduler is live (keep the boot catch-up call if still desired).

**Why:** decouples scheduling from the main app so it survives restarts/scaling, and can be run and monitored independently.
