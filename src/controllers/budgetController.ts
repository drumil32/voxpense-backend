import { Response } from "express";
import { Budget, BudgetType } from "../models/Budget";
import { AuthRequest } from "../middleware/auth";
import { updateBudget as updateBudgetService, updateBudgetSchema } from "../services/budgetService";
import { TransactionError } from "../services/transactionService";
import { defaultRange } from "../utils/period";

export async function createBudget(req: AuthRequest, res: Response) {
  try {
    const { name, type, startDate, endDate, amount, recurring } = req.body as {
      name?: string;
      type?: BudgetType;
      startDate?: string;
      endDate?: string;
      amount?: number;
      recurring?: boolean;
    };

    if (!name || !type || amount === undefined) {
      return res.status(400).json({ success: false, error: "name, type and amount are required" });
    }
    if (type !== "monthly" && type !== "yearly") {
      return res.status(400).json({ success: false, error: "type must be monthly or yearly" });
    }
    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ success: false, error: "amount must be greater than 0" });
    }

    const range = defaultRange(type);
    const start = startDate ? new Date(startDate) : range.startDate;
    const end = endDate ? new Date(endDate) : range.endDate;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ success: false, error: "Invalid dates" });
    }
    if (end < start) {
      return res.status(400).json({ success: false, error: "endDate must be after startDate" });
    }

    const isRecurring = recurring === true;
    const budget = await Budget.create({
      userId: req.userId,
      name,
      type,
      startDate: start,
      endDate: end,
      amount,
      spent: 0,
      recurring: isRecurring,
    });

    // A recurring budget heads its own series (successors reuse this seriesId).
    if (isRecurring) {
      budget.seriesId = budget._id as typeof budget.seriesId;
      await budget.save();
    }

    return res.status(201).json({ success: true, budget });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function listBudgets(req: AuthRequest, res: Response) {
  try {
    const budgets = await Budget.find({ userId: req.userId }).sort({ createdAt: -1 });
    return res.json({ success: true, budgets });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function updateBudget(req: AuthRequest, res: Response) {
  try {
    const parsed = updateBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const budget = await updateBudgetService(req.userId as string, req.params.id, parsed.data);
    return res.json({ success: true, budget });
  } catch (err) {
    if (err instanceof TransactionError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function getBudget(req: AuthRequest, res: Response) {
  try {
    const budget = await Budget.findOne({ _id: req.params.id, userId: req.userId });
    if (!budget) return res.status(404).json({ success: false, error: "Budget not found" });
    return res.json({ success: true, budget });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
