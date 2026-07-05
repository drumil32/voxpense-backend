import { Router } from "express";
import {
  createTransaction,
  listTransactions,
  updateTransactionController,
} from "../controllers/transactionController";
import { auth } from "../middleware/auth";

const router = Router();

router.use(auth);
router.post("/", createTransaction);
router.get("/", listTransactions);
router.patch("/:id", updateTransactionController);

export default router;
