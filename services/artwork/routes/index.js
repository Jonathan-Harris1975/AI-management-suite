// services/artwork/routes/index.js
import express from "express";
import createArtworkRouter from "./createArtwork.js";
import generateArtworkRouter from "./generateArtwork.js";

const router = express.Router();

router.use("/create", createArtworkRouter);
router.use("/generate", generateArtworkRouter);

export default router;
