import logger from "../service-logger.js";
const { info, warn, error, debug } = logger;
// services/artwork/routes/index.js
import express from "express";
import createArtworkRouter from "./createArtwork.js";
import generateArtworkRouter from "./generateArtwork.js";

const router = express.Router();

// POST /artwork/create
router.use("/create", createArtworkRouter);
// POST /artwork/generate
router.use("/generate", generateArtworkRouter);

export default router;
