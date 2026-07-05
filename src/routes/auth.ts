import { Router } from "express";
import { signup, signin, logout, me } from "../controllers/authController";
import { auth } from "../middleware/auth";

const router = Router();

router.post("/signup", signup);
router.post("/signin", signin);
router.post("/logout", auth, logout);
router.get("/me", auth, me);

export default router;
