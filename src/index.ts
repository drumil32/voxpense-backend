import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db";
import authRoutes from "./routes/auth";
import budgetRoutes from "./routes/budgets";
import transactionRoutes from "./routes/transactions";
import aiRoutes from "./routes/ai";
import subscriptionRoutes from "./routes/subscriptions";
import internalRoutes from "./routes/internal";

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
app.use("/api/internal", internalRoutes);

const PORT = Number(process.env.PORT) || 5000;

connectDB()
  .then(() => {
    // Scheduled work (recurring budgets + subscription charges) is driven
    // externally via POST /api/internal/run-jobs — nothing is scheduled in-process.
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
