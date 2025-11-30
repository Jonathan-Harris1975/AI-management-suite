// ============================================================================
// services/script/utils/orchestrator.js
// Unified Script Pipeline – weather + Turing quote + sponsor + chunks
// ============================================================================
//
// Flow:
//   1. Build context (weather, Turing quote, sponsor, taglines, tone)
//   2. Generate intro → main → outro via models.generateComposedEpisodeParts
//      (this uses promptTemplates + toneSetter under the hood)
//   3. Optional editorial pass (editorialPass.js)
//   4. Final cleanup for TTS friendliness
//   5. Save full transcript to R2 ("transcripts" alias)
//   6. Chunk transcript and save to R2 (rawText" alias)
//   7. Write rich metadata JSON to "meta" bucket
// ============================================================================

import { uploadText, putJson } from "../../shared/utils/r2-client.js";
import { extractMainContent } from "./textHelpers.js";
import getWeatherSummary from "./getWeatherSummary.js";
import getTuringQuote from "./getTuringQuote.js";
import getSponsor from "./getSponsor.js";
import generateCta from "./generateCta.js";
import chunkText from "./chunkText.js";
import * as models from "./models.js";
import { runEditorialPass } from "./editorialPass.js";
import { info, error } from "#logger.js";

// ============================================================================
// FINAL SANITISATION LAYER — makes text TTS-friendly and clean
// ============================================================================
function cleanupFinal(text) {
  if (!text) return "";

  return String(text)
    // Remove markdown (**bold**, _italics_, ### headers)
    .replace(/[*_]{1,3}/g, "")
    .replace(/^#{1,6}\s*/gm, "")

    // Remove scene directions / music cues
    .replace(/\[.*?(music|sfx|sound|cue|intro|outro|transition).*?]/gi, "")
    .replace(/\(.*?(music|sfx|sound|cue|intro|outro|transition).*?\)/gi, "")

    // Remove prefixes like "Voiceover:", "Scene:", "Style:"
    .replace(/^(scene|voiceover|style|direction|narrator)[:\-]/gim, "")

    // Remove obvious emojis
    .replace(/[🎵🎶🎤🎧🎙️✨⭐🌟🔥💥👉➡️❗⚠️★]+/g, "")

    // Strip stray markdown bullets
    .replace(/^\s*[-*]\s+/gm, "")

    // Collapse excessive whitespace
    .replace(/\s{3,}/g, "\n\n")

    .trim();
}

// Helper: should we run editorial pass?
function editorialEnabled() {
  const raw = String(process.env.ENABLE_EDITORIAL_PASS || "yes")
    .trim()
    .toLowerCase();
  return raw === "yes" || raw === "true" || raw === "y";
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================
export async function orchestrateEpisode(payload = {}) {
  // Allow both `{ sessionId, ... }` and bare string sessionId
  const base =
    typeof payload === "string" ? { sessionId: payload } : (payload || {});

  const now = new Date();

  const sessionId =
    base.sessionId ||
    base.session?.sessionId ||
    `TT-${now.toISOString().slice(0, 10)}`;

  const date = base.date || now.toISOString().slice(0, 10);
  const topic =
    base.topic ||
    "the most important artificial intelligence stories of the week";

  const tone =
    base.tone || {
      energy: "2.5/5",
      style: "dry British Gen X, sceptical but fair",
    };

  info("🧠 Orchestrate Script: start", { sessionId, date, topic });

  try {
    // ------------------------------------------------------------------------
    // 1. Weather + Turing quote + sponsor + taglines
    // ------------------------------------------------------------------------
    let weatherSummary = "";
    let turingQuote = "";

    try {
      weatherSummary =
        (await getWeatherSummary()) ||
        "very typical British weather, so feel free to keep it vague and lightly self-deprecating.";
    } catch (err) {
      error("weather.fail", { sessionId, error: String(err) });
      weatherSummary =
        "very typical British weather, so feel free to keep it vague and lightly self-deprecating.";
    }

    try {
      turingQuote =
        (await getTuringQuote()) ||
        `We can only see a short distance ahead, but we can see plenty there that needs to be done.`;
    } catch (err) {
      error("turingQuote.fail", { sessionId, error: String(err) });
      turingQuote = "";
    }

    const sponsorBook = getSponsor();
    const sponsorCta = sponsorBook ? generateCta(sponsorBook) : "";

    const introTagline =
      `Tired of drowning in artificial intelligence headlines and hype? ` +
      `Welcome to Turing's Torch: AI Weekly. I'm Jonathan Harris, here to cut through the noise and focus on what actually matters.`;

    const closingTagline =
      `That's it for this week's Turing's Torch: AI Weekly — your Gen-X guide to artificial intelligence without the fluff. ` +
      `I'm Jonathan Harris; thanks for listening, and keep building the future without losing your mind in the headlines.`;

    const context = {
      sessionId,
      date,
      topic,
      tone,
      weatherSummary,
      turingQuote,
      sponsorBook,
      sponsorCta,
      introTagline,
      closingTagline,
    };

    // ------------------------------------------------------------------------
    // 2. Generate intro → main → outro via models (uses promptTemplates + tone)
    // ------------------------------------------------------------------------
    const { intro, main, outro, formatted, callLog } =
      await models.generateComposedEpisodeParts(context);

    const initialFullText =
      (formatted && formatted.trim()) ||
      `${intro}\n\n${main}\n\n${outro}`.trim();

    // Make sure we only keep the “real” script text
    const initialClean = cleanupFinal(extractMainContent(initialFullText));

    // ------------------------------------------------------------------------
    // 3. Editorial Pass (optional, via editorialPass.js)
    // ------------------------------------------------------------------------
    let editedText = initialClean;

    if (editorialEnabled()) {
      const edited = await runEditorialPass({ sessionId }, initialClean);
      if (edited && edited.trim().length > 0) {
        editedText = edited.trim();
      }
    }

    // ------------------------------------------------------------------------
    // 4. Final cleanup for TTS
    // ------------------------------------------------------------------------
    const finalFullText = cleanupFinal(editedText);

    // ------------------------------------------------------------------------
    // 5. Save transcript to R2 ("transcripts" alias)
    // ------------------------------------------------------------------------
    const transcriptKey = `${sessionId}.txt`;
    const transcriptUrl = await uploadText(
      "transcripts",
      transcriptKey,
      finalFullText,
      "text/plain",
    );

    // ------------------------------------------------------------------------
    // 6. Chunk transcript and save to R2 ("chunks" alias)
    //    Keys: TT-YYYY-MM-DD/chunk-001.txt etc.
    // ------------------------------------------------------------------------
    const textChunks = chunkText(finalFullText);
    const chunkKeys = [];

    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      const key = `${sessionId}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      // 🔑 IMPORTANT: alias "chunks" so TTS can find them
      await uploadText("rawText", key, chunk, "text/plain");
      chunkKeys.push(key);
    }

    info("script.chunks.saved", {
      sessionId,
      count: chunkKeys.length,
    });

    // ------------------------------------------------------------------------
    // 7. Save metadata JSON to "meta" bucket
    // ------------------------------------------------------------------------
    const metaKey = `${sessionId}.json`;
    const nowIso = now.toISOString();

    const meta = {
      session: {
        sessionId,
        date,
      },
      transcriptUrl,
      transcriptKey,
      chunks: chunkKeys,
      weatherSummary,
      turingQuote,
      sponsorBook,
      sponsorCta,
      introTagline,
      closingTagline,
      topic,
      tone,
      callLog: callLog || [],
      textLength: finalFullText.length,
      chunkCount: chunkKeys.length,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await putJson("meta", metaKey, meta);

    info("script.orchestrate.complete", {
      sessionId,
      transcriptKey,
      metaKey,
      chunkCount: chunkKeys.length,
    });

    return {
      ok: true,
      sessionId,
      transcriptKey,
      transcriptUrl,
      metaKey,
      meta,
    };
  } catch (err) {
    error("script.orchestrate.fail", {
      sessionId,
      error: String(err),
      stack: err?.stack,
    });
    throw err;
  }
}

export default {
  orchestrateEpisode,
};
