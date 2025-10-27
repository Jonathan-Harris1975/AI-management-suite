// services/script/routes/compose.js
import express from "express";
import { info, error } from "#logger.js";
import {
  extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt,
} from "../utils/podcastHelpers.js";
import { resilientRequest } from "../../../shared/utils/ai-service.js";

const router = express.Router();

/**
 * POST /script/compose
 * Combines intro, main, and outro text into a single episode script,
 * and automatically generates metadata (title, description, SEO, artwork prompt).
 */
router.post("/", async (req, res) => {
  const { introText, mainText, outroText } = req.body;

  try {
    info("script.compose.start");

    // 1️⃣ Combine sections
    const composedText = `${introText || ""}\n\n${mainText || ""}\n\n${outroText || ""}`.trim();

    // 2️⃣ Generate Title + Description
    const metaPrompt = getTitleDescriptionPrompt(composedText);
    const metaResponse = await resilientRequest("metadata", { prompt: metaPrompt });
    const parsedMeta = extractAndParseJson(metaResponse);

    // 3️⃣ Generate SEO Keywords
    const seoPrompt = getSEOKeywordsPrompt(parsedMeta?.description || composedText);
    const seoResponse = await resilientRequest("metadata", { prompt: seoPrompt });
    const seoKeywords = typeof seoResponse === "string"
      ? seoResponse.trim()
      : JSON.stringify(seoResponse);

    // 4️⃣ Generate Artwork Prompt
    const artPrompt = getArtworkPrompt(parsedMeta?.description || composedText);
    const artResponse = await resilientRequest("metadata", { prompt: artPrompt });
    const artworkPrompt = typeof artResponse === "string"
      ? artResponse.trim()
      : JSON.stringify(artResponse);

    // 5️⃣ Build structured response
    const payload = {
      ok: true,
      composedText,
      metadata: {
        title: parsedMeta?.title || "Untitled Episode",
        description: parsedMeta?.description || "No description generated.",
        seoKeywords,
        artworkPrompt,
      },
    };

    info("script.compose.success", { title: payload.metadata.title });
    res.json(payload);
  } catch (err) {
    error("script.compose.fail", { err: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
