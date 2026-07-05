import { Router } from "express";
import { cronAuth } from "../middleware/cronAuth";
import { runJobs } from "../controllers/internalController";

const router = Router();

// Protected by a shared secret (x-cron-secret), NOT user auth.
router.post("/run-jobs", cronAuth, runJobs);

export default router;
