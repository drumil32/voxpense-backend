import { Router } from "express";
import { create, list, update, cancel } from "../controllers/subscriptionController";
import { auth } from "../middleware/auth";

const router = Router();

router.use(auth);
router.post("/", create);
router.get("/", list);
router.patch("/:id", update);
router.post("/:id/cancel", cancel);

export default router;
