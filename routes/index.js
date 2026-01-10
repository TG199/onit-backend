/**
 * Express router for handling routes.
 * @module routes/index
 */

import express from "express";
import authRoutes from "./auth.js";

const router = express.Router();

router.use("/auth", authRoutes);
export default router;
