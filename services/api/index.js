// services/api/index.js
import express from "express";
import podcastRouter from "../podcast/index.js";
import scriptRouter from "../script/index.js";
import ttsRouter from "../tts/index.js";
import artworkRouter from "../artwork/index.js";
import mergeRouter from "../merge/index.js";

export const router = express.Router();

router.use("/podcast", podcastRouter);
router.use("/script", scriptRouter);
router.use("/tts", ttsRouter);
router.use("/merge", mergeRouter);
router.use("/artwork", artworkRouter);

export default router;
