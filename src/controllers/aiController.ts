import { Response } from "express";
import { toFile } from "openai";
import { z } from "zod";
import { getOpenAI } from "../config/openai";
import { AuthRequest } from "../middleware/auth";
import { runAgent, agentResultSchema } from "../ai/agent";

const TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

// Shared: turn an uploaded audio buffer into text via OpenAI.
// Also used by the feedback controller for optional voice feedback notes.
export async function transcribeBuffer(file: Express.Multer.File): Promise<string> {
  const openai = getOpenAI();
  const filename = file.originalname || "audio.webm";
  const audioFile = await toFile(file.buffer, filename, { type: file.mimetype });

  const result = await openai.audio.transcriptions.create({
    file: audioFile,
    model: TRANSCRIBE_MODEL,
    response_format: "text",
  });

  // `response_format: "text"` returns a plain string.
  return typeof result === "string" ? result : (result as { text: string }).text;
}

export async function transcribe(req: AuthRequest, res: Response) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: "No audio file provided" });
    }

    const text = await transcribeBuffer(file);
    console.log(`[transcribe] user=${req.userId} len=${text.length} text="${text}"`);

    return res.json({ success: true, text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    console.error("[transcribe] error:", message);
    return res.status(500).json({ success: false, error: message });
  }
}

// Single entry point for the voice → transaction flow: the frontend uploads
// audio once, and the backend transcribes AND runs the agent internally.
export async function voice(req: AuthRequest, res: Response) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, action: "none", error: "No audio file provided" });
    }
    const budgetId = (req.body?.budgetId as string) || "";
    if (!budgetId) {
      return res.status(400).json({ success: false, action: "none", error: "budgetId is required" });
    }

    const text = await transcribeBuffer(file);
    console.log(`[voice] user=${req.userId} budget=${budgetId} text="${text}"`);

    const result = await runAgent({
      userId: req.userId as string,
      budgetId,
      text,
    });

    // Surface the transcript so the UI can show what was heard.
    const safe = agentResultSchema.parse(result);
    return res.json({ ...safe, transcript: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Voice processing failed";
    console.error("[voice] error:", message);
    return res.status(500).json({ success: false, action: "none", error: message });
  }
}

const agentRequestSchema = z.object({
  text: z.string().trim().min(1, "text is required").max(2000),
  budgetId: z.string().min(1, "budgetId is required"),
});

export async function agent(req: AuthRequest, res: Response) {
  try {
    const parsed = agentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ success: false, error: parsed.error.issues[0]?.message || "Invalid input" });
    }

    const result = await runAgent({
      userId: req.userId as string,
      budgetId: parsed.data.budgetId,
      text: parsed.data.text,
    });

    console.log(
      `[agent] user=${req.userId} action=${result.action} budget=${parsed.data.budgetId} text="${parsed.data.text}"`
    );

    // Output guardrail: never send a shape the frontend doesn't expect.
    const safe = agentResultSchema.parse(result);
    return res.json(safe);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent failed";
    console.error("[agent] error:", message);
    return res.status(500).json({ success: false, action: "none", error: message });
  }
}
