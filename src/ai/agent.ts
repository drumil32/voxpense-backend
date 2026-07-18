import { Agent, run, tool, setDefaultOpenAIKey } from "@openai/agents";
import { z } from "zod";
import { CATEGORY_VALUES, CATEGORY_LEGEND } from "../constants/categories";
import { addTransaction, TransactionError } from "../services/transactionService";
import { Budget, IBudget } from "../models/Budget";
import { ITransaction } from "../models/Transaction";
import { AgentConversation } from "../models/AgentConversation";

const AGENT_MODEL = "gpt-4o";

// How long a pending question stays answerable. Also mirrored by the TTL
// index on AgentConversation.expiresAt.
const QUESTION_TTL_MS = 5 * 60 * 1000;

// ---- Output guardrail (what we send to the frontend) ----
// A single message can produce many transactions, so txns is an array.
// action "ask" means the agent asked a clarifying question and expects the
// user's next message to answer it (txns may still be present if some
// expenses were complete enough to add already).
export const agentResultSchema = z.object({
  success: z.boolean(),
  action: z.enum(["add_transaction", "ask", "none"]),
  message: z.string(),
  txns: z.array(z.any()).optional(),
  budget: z.any().optional(),
});
export type AgentResult = z.infer<typeof agentResultSchema>;

// ---- Structured final output of the model ----
// needsReply is how the model tells us, unambiguously, that its message is a
// question the user must answer (vs. a confirmation or a decline). We only
// persist the response id for continuation when needsReply is true.
const agentOutputSchema = z.object({
  message: z.string().describe("One short sentence to show the user."),
  needsReply: z
    .boolean()
    .describe(
      "True only when the message is a question and you cannot proceed without the user's answer. False otherwise."
    ),
});
type AgentOutput = z.infer<typeof agentOutputSchema>;

// Context is passed to run() and reaches tools via runContext.context.
// budgetId/userId live here — the model never sees or supplies them.
// The tool pushes each created txn into `outcomes` (the model may call it
// multiple times for a multi-expense message) and keeps the latest budget.
interface AgentContext {
  userId: string;
  budgetId: string;
  text: string;
  outcomes: ITransaction[];
  lastBudget: IBudget | null;
}

// ---- Tool argument guardrail: Zod schema drives both the tool's JSON schema
// and runtime validation of the model's arguments. ----
const addTransactionParams = z.object({
  name: z.string().min(1).max(120).describe("Short label, e.g. 'Big Bazaar' or 'Uber ride'."),
  category: z
    .enum(CATEGORY_VALUES)
    .describe(
      `The single best-matching category for this expense. Allowed values and what they mean: ${CATEGORY_LEGEND}. If nothing fits, use "other".`
    ),
  amount: z.number().positive().describe("Spend amount in INR (rupees) as a positive number."),
  date: z
    .string()
    .optional()
    .describe(
      "The expense date as an absolute calendar date in strict YYYY-MM-DD format. " +
        "Resolve any relative or partial date (e.g. 'today', 'yesterday', 'the 5th', '05 Feb') " +
        "using today's date given in the instructions. Omit this field entirely if the user did not mention a date."
    ),
});

const addTransactionTool = tool<typeof addTransactionParams, AgentContext>({
  name: "add_transaction",
  description:
    "Record a spending transaction in the user's currently selected budget. " +
    "Call this only when the user clearly states an expense with an amount.",
  parameters: addTransactionParams,
  async execute(input, runContext) {
    const ctx = runContext?.context;
    if (!ctx) throw new Error("Missing agent context");

    // Parse the model's YYYY-MM-DD into a local Date. If absent/invalid,
    // leave undefined so the DB default (today) applies.
    let date: Date | undefined;
    if (input.date) {
      const parts = input.date.split("-").map(Number);
      if (parts.length === 3 && parts.every((n) => Number.isInteger(n))) {
        const [y, m, d] = parts;
        const parsed = new Date(y, m - 1, d);
        if (!Number.isNaN(parsed.getTime())) date = parsed;
      }
    }

    const { txn, budget } = await addTransaction(
      ctx.userId,
      {
        budgetId: ctx.budgetId,
        name: input.name,
        category: input.category,
        amount: input.amount,
        date,
      },
      { source: "agent", transcript: ctx.text }
    );

    ctx.outcomes.push(txn);
    ctx.lastBudget = budget;
    return `Added ₹${input.amount.toLocaleString("en-IN")} for ${input.name} (${input.category}).`;
  },
});

// Built fresh on every run so "today" is always the real current date
// (the agent instance is long-lived, so a hardcoded date would go stale).
function buildInstructions(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const todayIso = `${y}-${m}-${d}`;
  const weekday = now.toLocaleDateString("en-IN", { weekday: "long" });

  return `You are the assistant inside a budget-tracking app. The user speaks a request that has been transcribed to text.
Your only capability right now is adding spending transactions to the budget the user already has open.
- Amounts are in Indian Rupees (INR). Interpret words like "rupees", "rs", "500 bucks" as INR.
- Choose the single best category from the allowed list.
- The add_transaction tool records exactly ONE expense. If the user mentions SEVERAL expenses in one message (e.g. a haircut, then breakfast, then a movie ticket), call add_transaction SEPARATELY for EACH expense — one tool call per expense. Do not merge them or skip any.
- Each expense gets its own name, category, amount and (if stated) date.
- If the message clearly describes at least one expense with an amount, call the tool for each.

CLARIFYING QUESTIONS:
- If the user clearly wants to record an expense but a required detail is missing or the transcription is too garbled to act on (most often a missing amount, or an unintelligible item), do NOT guess and do NOT call the tool for that expense. Ask ONE short question for exactly the missing detail and set needsReply to true.
- The user's answer arrives as your next message in this same conversation. Combine it with everything said earlier, then add the transaction(s).
- If some expenses in a message are complete and one is not, add the complete ones first, then ask about the incomplete one (needsReply true).
- Only ask questions about recording expenses. If the message is not about expenses at all, briefly say you can only record expenses (needsReply false). Never ask more than one question per turn.

OUTPUT FORMAT:
- message: ONE short sentence for the user — what you added, or your question, or why you couldn't act.
- needsReply: true only when message is a question you need answered to proceed; false otherwise.

DATE HANDLING (for the add_transaction "date" field — always output YYYY-MM-DD):
Today's date is ${todayIso} (${weekday}). Use it as the reference for every relative date.
- If the user does NOT mention any date, omit the date field (it defaults to today).
- "today" -> ${todayIso}. "yesterday" -> the day before today. "day before yesterday" -> two days before today.
- A day number only, like "the 5th" or "on 5th" -> the 5th of the CURRENT month and year.
- A day and month with no year, like "05 Feb" or "Feb 5" -> that day/month in the CURRENT year (${y}).
- A weekday like "last Monday" -> the most recent past date that fell on that weekday.
- Example: today is ${todayIso}; "I spent 50 on pani puri on 5th" -> date is ${y}-${m}-05 (5th of this month and year).
Always resolve to a concrete YYYY-MM-DD; never output words like "yesterday" in the date field.`;
}

const budgetAgent = new Agent<AgentContext, typeof agentOutputSchema>({
  name: "Budget Assistant",
  instructions: () => buildInstructions(),
  model: AGENT_MODEL,
  modelSettings: { temperature: 0 },
  tools: [addTransactionTool],
  outputType: agentOutputSchema,
});

// If the agent asked this user a question recently, return the response id to
// continue that thread. A stored row that has lazily outlived its TTL, or one
// tied to a different budget (user navigated elsewhere), is dropped instead.
async function getPendingResponseId(userId: string, budgetId: string): Promise<string | undefined> {
  const pending = await AgentConversation.findOne({ userId });
  if (!pending) return undefined;
  if (pending.expiresAt <= new Date() || pending.budgetId.toString() !== budgetId) {
    await pending.deleteOne();
    return undefined;
  }
  return pending.lastResponseId;
}

interface RunAgentParams {
  userId: string;
  budgetId: string;
  text: string;
}

export async function runAgent({ userId, budgetId, text }: RunAgentParams): Promise<AgentResult> {
  // Validate the budget belongs to the user up front (fail fast, don't burn a model call).
  const budgetExists = await Budget.exists({ _id: budgetId, userId });
  if (!budgetExists) {
    return { success: false, action: "none", message: "Budget not found." };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set in environment");
  setDefaultOpenAIKey(apiKey);

  // Continue a pending question thread, if any — OpenAI replays the earlier
  // turns server-side, so we send only the user's new message.
  const previousResponseId = await getPendingResponseId(userId, budgetId);

  const context: AgentContext = { userId, budgetId, text, outcomes: [], lastBudget: null };

  let output: AgentOutput | null = null;
  let lastResponseId: string | undefined;
  try {
    // maxTurns raised so a long list of expenses (one tool call each) can all run.
    const result = await run(budgetAgent, text, { context, maxTurns: 30, previousResponseId });
    output = result.finalOutput ?? null;
    lastResponseId = result.lastResponseId;
  } catch (err) {
    if (err instanceof TransactionError) {
      // Leave any pending conversation in place — the user can retry their
      // answer; the TTL cleans it up otherwise.
      return { success: false, action: "none", message: err.message };
    }
    // If some transactions were already written before an error, still return them.
    if (context.outcomes.length === 0) throw err;
  }

  // Persist the thread only while the agent is waiting on an answer; a
  // follow-up question overwrites the previous id, anything else ends the
  // conversation. One pending question per user, max.
  const asked = output?.needsReply === true && !!lastResponseId;
  if (asked) {
    await AgentConversation.findOneAndUpdate(
      { userId },
      { budgetId, lastResponseId, expiresAt: new Date(Date.now() + QUESTION_TTL_MS) },
      { upsert: true }
    );
  } else {
    await AgentConversation.deleteOne({ userId });
  }

  const message = (output?.message ?? "").trim();

  if (asked) {
    return {
      success: true,
      action: "ask",
      message: message || "Could you give me a bit more detail?",
      txns: context.outcomes.length > 0 ? context.outcomes : undefined,
      budget: context.lastBudget ?? undefined,
    };
  }

  // The tool pushes to outcomes only when a transaction was actually written.
  if (context.outcomes.length > 0 && context.lastBudget) {
    const total = context.outcomes.reduce((sum, t) => sum + t.amount, 0);
    const count = context.outcomes.length;
    return {
      success: true,
      action: "add_transaction",
      message:
        message ||
        `Added ${count} transaction${count > 1 ? "s" : ""} totalling ₹${total.toLocaleString("en-IN")}.`,
      txns: context.outcomes,
      budget: context.lastBudget,
    };
  }

  return {
    success: true,
    action: "none",
    message: message || "Sorry, I couldn't understand that as an expense.",
  };
}
