import { Router } from "express";
import multer from "multer";
import { transcribe, agent, voice, speak } from "../controllers/aiController";
import { auth } from "../middleware/auth";

// Keep audio in memory; cap at ~25MB (OpenAI's limit). Duration (90s) is enforced client-side.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const router = Router();

router.use(auth);
router.post("/transcribe", upload.single("audio"), transcribe);
router.post("/agent", agent);
// One-shot: audio in, transcription + agent handled server-side.
router.post("/voice", upload.single("audio"), voice);
// Text in, MP3 out — lets the client speak the agent's reply.
router.post("/speak", speak);

export default router;
