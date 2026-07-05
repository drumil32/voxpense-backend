import { Router } from "express";
import { createBudget, listBudgets, getBudget, updateBudget } from "../controllers/budgetController";
import { auth } from "../middleware/auth";

const router = Router();

router.use(auth);
router.post("/", createBudget);
router.get("/", listBudgets);
router.get("/:id", getBudget);
router.patch("/:id", updateBudget);

export default router;
