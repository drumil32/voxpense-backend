import { Response } from "express";
import { Transaction } from "../models/Transaction";
import { AuthRequest } from "../middleware/auth";
import {
  addTransaction,
  addTransactionSchema,
  updateTransaction,
  updateTransactionSchema,
  TransactionError,
} from "../services/transactionService";

export async function createTransaction(req: AuthRequest, res: Response) {
  try {
    const parsed = addTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const { txn, budget } = await addTransaction(req.userId as string, parsed.data);
    return res.status(201).json({ success: true, txn, budget });
  } catch (err) {
    if (err instanceof TransactionError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function updateTransactionController(req: AuthRequest, res: Response) {
  try {
    const parsed = updateTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const { txn, budget } = await updateTransaction(
      req.userId as string,
      req.params.id,
      parsed.data
    );
    return res.json({ success: true, txn, budget });
  } catch (err) {
    if (err instanceof TransactionError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function listTransactions(req: AuthRequest, res: Response) {
  try {
    const filter: Record<string, unknown> = { userId: req.userId };
    if (req.query.budgetId) filter.budgetId = req.query.budgetId;

    const txns = await Transaction.find(filter).sort({ createdAt: -1 });
    return res.json({ success: true, txns });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
