// services/script/routes/createScript.js

import express from "express";
import { v4 as uuidv4 } from "uuid";
import { generateIntro, generateMain, generateOutro } from "../utils/generator.js";
import { storeTempPart } from "../utils/sessionCache.js";

const router = express.Router();

router.post("/create-script", async (req, res) => {
  const tone = req.body.tone || "neutral";
  const sessionId = uuidv4();

  try {
    const [intro, main, outro] = await Promise.all([
      generateIntro(sessionId, tone),
      generateMain(sessionId, tone),
      generateOutro(sessionId, tone),
    ]);

    storeTempPart(sessionId, "intro", intro);
    storeTempPart(sessionId, "main", main);
    storeTempPart(sessionId, "outro", outro);

    res.status(200).json({ status: "started", sessionId });
  } catch (err) {
    console.error("Script creation failed:", err);
    res.status(500).json({ error: "Script generation failed" });
  }
});

export default router;