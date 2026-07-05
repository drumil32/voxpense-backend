import { BudgetType } from "../models/Budget";
import { Frequency } from "../models/Subscription";

export interface Period {
  startDate: Date;
  endDate: Date;
}

// The default period for a brand-new budget: the current month or year.
export function defaultRange(type: BudgetType, now: Date = new Date()): Period {
  if (type === "monthly") {
    return {
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }
  return {
    startDate: new Date(now.getFullYear(), 0, 1),
    endDate: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
  };
}

// The period immediately after `prevStart` (used to roll a recurring budget forward).
export function nextPeriod(type: BudgetType, prevStart: Date): Period {
  const y = prevStart.getFullYear();
  const m = prevStart.getMonth();
  if (type === "monthly") {
    return {
      startDate: new Date(y, m + 1, 1),
      endDate: new Date(y, m + 2, 0, 23, 59, 59, 999),
    };
  }
  return {
    startDate: new Date(y + 1, 0, 1),
    endDate: new Date(y + 1, 11, 31, 23, 59, 59, 999),
  };
}

// The next charge date for a subscription, `frequency` after `date`.
export function advanceByFrequency(date: Date, frequency: Frequency): Date {
  const d = new Date(date);
  switch (frequency) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}
