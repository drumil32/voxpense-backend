import { Router } from "express";
import multer from "multer";
import { createFeedback, addVoiceFeedback } from "../controllers/feedbackController";
import { auth } from "../middleware/auth";

// Same limits as the AI routes: audio kept in memory, capped at ~25MB.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const router = Router();

router.use(auth);
router.post("/", createFeedback);
router.post("/voice", upload.single("audio"), addVoiceFeedback);

export default router;
