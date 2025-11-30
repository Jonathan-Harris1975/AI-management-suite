// ============================================================================
// services/script/utils/orchestrator.js
// Unified Script Pipeline – weather + Turing quote + sponsor + chunks
// ============================================================================
//
// Flow:
//   1. Build context (weather, Turing quote, sponsor, taglines, tone)
//   2. Generate intro → main → outro via models.js
//   3. Optional editorial pass (ENABLE_EDITORIAL_PASS)
//   4. Final cleanup for TTS friendliness
//   5. Save full transcript to R2 ("transcripts" alias)
//   6. Chunk transcript and save to R2 ("rawtext" alias) as chunk-001.txt, ...
//   7. Write rich metadata JSON to "meta" bucket
// ============================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { uploadText, putJson } from "../../shared/utils/r2-client.js";
import { extractMainContent } from "./textHelpers.js";
import getWeatherSummary from "./getWeatherSummary.js";
import getTuringQuote from "./getTuringQuote.js";
import getSponsor from "./getSponsor.js";
import generateCta from "./generateCta.js";
import chunkText from "./chunkText.js";
import * as models from "./models.js";
import { info, error } from "#logger.js";

// ============================================================================
// FINAL SANITISATION LAYER — makes text TTS-friendly and clean
// ============================================================================
function cleanupFinal(text) {
  if (!text) return "";

  return String(text)
    // Remove markdown (**bold**, _, ###)
    .replace(/[*_]{1,3}/g, "")
    .replace(/^#{1,6}\s*/gm, "")

    // Remove scene directions / music cues
    .replace(/\[.*?(music|sfx|sound|cue|intro|outro|transition).*?]/gi, "")
    .replace(/\(.*?(music|sfx|sound|cue|intro|outro|transition).*?\)/gi, "")

    // Remove prefixes like "Voiceover:", "Scene:", "Style:"
    .replace(/^(scene|voiceover|style|direction)[:\-]/gim, "")

    // Remove a bunch of obvious emojis
    .replace(/[🎵🎶🎤🎧🎙️✨⭐🌟🔥💥👉➡️❗⚠️★]+/g, "")

    // Strip stray markdown bullets
    .replace(/^\s*[-*]\s+/gm, "")

    // Remove excessive whitespace
    .replace(/\s{3,}/g, "\n\n")

    .trim();
}

// Helper: should we run editorial pass?
function editorialEnabled() {
  const raw = String(process.env.ENABLE_EDITORIAL_PASS || "yes").trim().toLowerCase();
  return raw === "yes" || raw === "true" || raw === "y";
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================
export async function orchestrateEpisode(payload = {}) {
  const sessionId =
    payload.sessionId ||
    payload.session?.sessionId ||
    `TT-${new Date().toISOString().slice(0, 10)}`;

  const date = payload.date || new Date().toISOString().slice(0, 10);
  const topic =
    payload.topic ||
    "the most important artificial intelligence stories of the week";
  const tone = payload.tone || {
    energy: "2.5/5",
    style: "dry British Gen X, sceptical but fair",
  };

  info("🧠 Orchestrate Script: start", { sessionId });

  try {
    // ------------------------------------------------------------------------
    // 0. Context: weather, Turing quote, sponsor, CTA, taglines
    // ------------------------------------------------------------------------
    const [weatherSummaryRaw, turingQuoteRaw] = await Promise.all([
      getWeatherSummary().catch((err) => {
        error("weather.summary.error", { message: err?.message });
        return "";
      }),
      getTuringQuote().catch((err) => {
        error("turing.quote.error", { message: err?.message });
        return "";
      }),
    ]);

    const weatherSummary =
      weatherSummaryRaw ||
      "very typical British weather, so feel free to keep it vague and lightly self-deprecating.";

    const turingQuote = turingQuoteRaw || "";

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
    // 1. Generate intro → main → outro
    // ------------------------------------------------------------------------
    const {
      intro,
      main,
      outro,
      formatted,
      callLog,
    } = await models.generateComposedEpisodeParts(context);

    const initialFullText =
      (formatted && formatted.trim()) ||
      `${intro}\n\n${main}\n\n${outro}`.trim();

    // ------------------------------------------------------------------------
    // 2. Editorial Pass (optional)
    // ------------------------------------------------------------------------
    let editedText = initialFullText;

    if (editorialEnabled()) {
      const editorialContent = await resilientRequest("editorialPass", {
        sessionId,
        section: "editorial",
        messages: [
          {
            role: "system",
            content: `
You are a human podcast editor.

Task:
- Take the following full script (intro, main, outro) for an artificial intelligence news podcast.
- Keep the dry British Gen X tone and the host's personality.
- Improve flow, remove repetition, and tighten long sentences.
- Do NOT add music cues, sound effects, or scene directions.
- Do NOT add markdown, headings, or bullet points.
- Do NOT invent new URLs; keep them generic as "show notes" or "my website".

Return ONLY the edited script as plain text.
            `.trim(),
          },
          {
            role: "user",
            content: initialFullText,
          },
        ],
        max_tokens: 4000,
      });

      const editorialText = extractMainContent(editorialContent || "");
      if (editorialText && editorialText.trim().length > 0) {
        editedText = editorialText.trim();
      }
    }

    // ------------------------------------------------------------------------
    // 3. Final cleanup for TTS
    // ------------------------------------------------------------------------
    const finalFullText = cleanupFinal(editedText);

    // ------------------------------------------------------------------------
    // 4. Save transcript to R2 ("transcripts" alias)
    // ------------------------------------------------------------------------
    const transcriptKey = `${sessionId}.txt`;
    const transcriptUrl = await uploadText(
      "transcripts",
      transcriptKey,
      finalFullText,
      "text/plain"
    );

    // ------------------------------------------------------------------------
    // 5. Chunk transcript and save to R2 ("rawtext" alias)
    //    Keys: TT-2025-11-29/chunk-001.txt etc.
// ------------------------------------------------------------------------
    const textChunks = chunkText(finalFullText);
    const chunkKeys = [];

    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      const key = `${sessionId}/chunk-${String(i + 1).padStart(3, "0")}.txt`;

      await uploadText("rawtext", key, chunk, "text/plain");
      chunkKeys.push(key);
    }

    // ------------------------------------------------------------------------
    // 6. Save metadata JSON (used later by TTS / merge / RSS tools)
    // ------------------------------------------------------------------------
    const metaKey = `${sessionId}.json`;

    const meta = {
      session: {
        sessionId,
        date: new Date().toISOString(),
      },
      transcriptUrl,
      introLength: intro.length,
      mainLength: main.length,
      outroLength: outro.length,
      textLength: finalFullText.length,
      topic,
      tone,
      weatherSummary,
      turingQuote,
      sponsor: sponsorBook || null,
      sponsorCta: sponsorCta || "",
      textChunks: chunkKeys,
      callLog: callLog || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await putJson("meta", metaKey, meta);

    info("✅ Script orchestration complete", {
      sessionId,
      transcriptKey,
      metaKey,
      chunkCount: chunkKeys.length,
      calls: (callLog || []).length,
    });

    // ------------------------------------------------------------------------
    // 7. Result back to podcast pipeline
    // ------------------------------------------------------------------------
    return {
      ok: true,
      sessionId,
      metaUrls: {
        transcriptUrl,
      },
      transcriptKey,
      metaKey,
      text: finalFullText,
      callLog: callLog || [],
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
