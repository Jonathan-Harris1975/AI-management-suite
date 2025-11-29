// ============================================================================
// orchestrator.js – Option A (FULL VERSION WITH WEATHER + TURING QUOTE)
// ============================================================================
// - Fetches weather summary
// - Fetches Turing quote
// - Builds intro context
// - Generates intro → main → outro via models.js
// - Runs editorial pass
// - Final TTS cleanup
// - Uploads transcript
// - Writes metadata JSON
// - Returns data to podcast pipeline
// ============================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { uploadText, putJson } from "../../shared/utils/r2-client.js";
import { extractMainContent } from "./textHelpers.js";
import { info, error } from "#logger.js";

// These MUST exist in your project.
// If names/paths differ, tell me and I'll adjust them.
import { getWeatherSummary } from "./getWeatherSummary.js";
import { getTuringQuote } from "./getTuringQuote.js";

// ============================================================================
// Final cleanup for TTS
// ============================================================================
function cleanupFinal(text) {
  if (!text) return "";

  return String(text)
    // Remove markdown formatting
    .replace(/[*_]{1,3}/g, "")
    .replace(/^#{1,6}\s*/gm, "")

    // Remove scene/music cues
    .replace(/\[.*?(music|sfx|cue|style|intro|outro).*?]/gi, "")
    .replace(/\(.*?(music|sfx|cue|style|intro|outro).*?\)/gi, "")

    // Remove prefixes
    .replace(/^(scene|voiceover|style|direction)[:\-]/gim, "")

    // Remove emojis
    .replace(/[🎵🎶🎤🎧🎙️✨⭐🌟🔥💥👉➡️❗⚠️★]+/g, "")

    // Fix ellipses
    .replace(/\.{3,}/g, ".")

    // Compact whitespace
    .replace(/\s{3,}/g, "\n\n")

    .trim();
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================
export async function orchestrateEpisode({
  sessionId,
  date,
  topic,
  tone = {},
}) {
  info("🧠 Orchestrate Script: start", { sessionId });

  try {
    // ------------------------------------------------------------------------
    // 1. WEATHER SUMMARY + TURING QUOTE
    // ------------------------------------------------------------------------
    let weather = "";
    let turing = "";

    try {
      weather = await getWeatherSummary();
      info("weather.ok");
    } catch (err) {
      error("weather.fail", { err: err.message });
      weather = "";
    }

    try {
      turing = await getTuringQuote();
      info("turingQuote.ok");
    } catch (err) {
      error("turingQuote.fail", { err: err.message });
      turing = "";
    }

    // ------------------------------------------------------------------------
    // 2. Generate INTRO / MAIN / OUTRO via models.js
    // ------------------------------------------------------------------------
    const parts = await (
      await import("./models.js")
    ).generateComposedEpisodeParts({
      sessionId,
      date,
      topic,
      tone,
      weather,
      turing,
    });

    const {
      intro,
      main,
      outro,
      formatted,   // optional formatted version from models
      callLog,
    } = parts;

    const initialFullText =
      formatted?.trim() ||
      `${intro}\n\n${main}\n\n${outro}`.trim();

    // ------------------------------------------------------------------------
    // 3. EDITORIAL PASS
    // ------------------------------------------------------------------------
    const editorialResp = await resilientRequest({
      routeName: "editorialPass",
      sessionId,
      model: "chatgpt", // your configured best-first route
      messages: [
        {
          role: "system",
          content:
            "You are an expert British editor. Improve pacing, clarity, flow. Keep concise. No markdown. TTS friendly.",
        },
        {
          role: "user",
          content: initialFullText,
        },
      ],
      max_tokens: 4000,
    });

    const editorialText = extractMainContent(
      editorialResp?.content || editorialResp || ""
    );

    // ------------------------------------------------------------------------
    // 4. FINAL CLEANUP (TTS-SAFE)
    // ------------------------------------------------------------------------
    const finalFullText = cleanupFinal(
      editorialText || initialFullText
    );

    // ------------------------------------------------------------------------
    // 5. UPLOAD TRANSCRIPT
    // ------------------------------------------------------------------------
    const transcriptKey = `${sessionId}.txt`;
    const transcriptUrl = await uploadText(
      "transcripts",            // must match R2 alias
      transcriptKey,
      finalFullText,
      "text/plain"
    );

    // ------------------------------------------------------------------------
    // 6. WRITE META JSON
    // ------------------------------------------------------------------------
    const metaKey = `${sessionId}.json`;
    const meta = {
      session: {
        sessionId,
        date: new Date().toISOString(),
      },
      transcriptUrl,
      weather,
      turingQuote: turing,
      introLength: intro?.length || 0,
      mainLength: main?.length || 0,
      outroLength: outro?.length || 0,
      textLength: finalFullText.length,
      topic,
      tone,
      callLog,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await putJson("meta", metaKey, meta);

    info("✅ Script orchestration complete", {
      sessionId,
      transcriptKey,
      metaKey,
    });

    // ------------------------------------------------------------------------
    // RETURN TO PIPELINE
    // ------------------------------------------------------------------------
    return {
      ok: true,
      sessionId,
      metaUrls: {
        transcriptUrl,
      },
      text: finalFullText,
      callLog,
    };

  } catch (err) {
    error("❌ Script orchestration failed", {
      sessionId,
      error: err.message,
    });
    throw err;
  }
}

export default { orchestrateEpisode };
