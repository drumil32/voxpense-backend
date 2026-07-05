import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db";
import authRoutes from "./routes/auth";
import budgetRoutes from "./routes/budgets";
import transactionRoutes from "./routes/transactions";
import aiRoutes from "./routes/ai";
import subscriptionRoutes from "./routes/subscriptions";
import { runDailyJobs, scheduleDailyJobs } from "./jobs/scheduler";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/budgets", budgetRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/subscriptions", subscriptionRoutes);

const PORT = Number(process.env.PORT) || 5000;

connectDB()
  .then(async () => {
    // Catch up recurring budgets + subscription charges missed while down, then schedule daily.
    await runDailyJobs().catch((e) => console.error("[scheduler] boot error:", e));
    scheduleDailyJobs();

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
