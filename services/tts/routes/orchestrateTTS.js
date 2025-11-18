import logger from "../service-logger.js";
const { info, warn, error, debug } = logger;
// Deprecated: prefer routes/tts.js
import express from "express";
import ttsRouter from "./tts.js";

const router = express.Router();
router.use("/", ttsRouter); // forward everything to /tts routes

export default router;
