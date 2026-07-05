import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { Transaction } from "../models/Transaction";
import { Budget } from "../models/Budget";
import { TransactionError } from "../services/transactionService";
import {
  createSubscription,
  createSubscriptionSchema,
  listSubscriptions,
  cancelSubscription,
  updateSubscription,
  updateSubscriptionSchema,
} from "../services/subscriptionService";

export async function create(req: AuthRequest, res: Response) {
  try {
    const parsed = createSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const { subscription, firstCharge } = await createSubscription(
      req.userId as string,
      parsed.data
    );

    // Return the first generated charge (+ its budget) so the UI can update live.
    let txn = null;
    let budget = null;
    if (firstCharge) {
      txn = await Transaction.findById(firstCharge.txnId);
      budget = await Budget.findById(firstCharge.budgetId);
    }

    return res.status(201).json({ success: true, subscription, txn, budget });
  } catch (err) {
    if (err instanceof TransactionError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function list(req: AuthRequest, res: Response) {
  try {
    const budgetId = typeof req.query.budgetId === "string" ? req.query.budgetId : undefined;
    const subscriptions = await listSubscriptions(req.userId as string, budgetId);
    return res.json({ success: true, subscriptions });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function update(req: AuthRequest, res: Response) {
  try {
    const parsed = updateSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const subscription = await updateSubscription(req.userId as string, req.params.id, parsed.data);
    return res.json({ success: true, subscription });
  } catch (err) {
    if (err instanceof TransactionError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: "Server error" });
  }
}

export async function cancel(req: AuthRequest, res: Response) {
  try {
    const subscription = await cancelSubscription(req.userId as string, req.params.id);
    return res.json({ success: true, subscription });
  } catch (err) {
    if (err instanceof TransactionError) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
