// services/script/utils/orchestrator.js
// ------------------------------------------------------------
// Unified Orchestrator for Intro → Main → Outro → Editorial
// → Formatting → FINAL CLEANUP → Chunking → Transcript Export
// ------------------------------------------------------------

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { info, error } from "#logger.js";
import * as models from "./models.js";
import { extractMainContent } from "./textHelpers.js";
import { putJson, uploadText } from "../../shared/utils/r2-client.js";

// ------------------------------------------------------------
// FINAL SANITISATION LAYER — removes ALL style/scene cues
// ------------------------------------------------------------
function cleanupFinal(text) {
  if (!text) return "";

  return String(text)
    // Remove markdown (**bold**, *italics*, ### headers)
    .replace(/[*_]{1,3}/g, "")
    .replace(/^#{1,6}\s*/gm, "")

    // Remove stage + style directions: [Music…], (SFX…), Voiceover:
    .replace(/\[.*?(music|sfx|sound|cue|intro|outro|transition).*?]/gi, "")
    .replace(/\(.*?(music|sfx|sound|cue|intro|outro|transition).*?\)/gi, "")
    .replace(/^(scene|style|voiceover|narrator|direction)[:\-]/gim, "")

    // Remove decorative emojis
    .replace(/[🎵🎶🎤🎧🎙️✨⭐🌟🔥💥👉➡️❗⚠️★]+/g, "")

    // Remove markdown horizontal rules
    .replace(/^[-–—]{3,}$/gm, "")

    // Remove double-space gaps
    .replace(/\s{3,}/g, "\n\n")

    .trim();
}

// ------------------------------------------------------------
// MAIN ORCHESTRATION PIPELINE
// ------------------------------------------------------------
export async function orchestrateEpisode({ sessionId, date, topic, tone = {} }) {
  info("🧠 Orchestrate Script: start", { sessionId });

  try {
    // -------------------------------
    // 1) INTRO
    // -------------------------------
    const introRaw = await models.generateIntro({ date, topic, tone });
    const intro = cleanupFinal(introRaw);

    // -------------------------------
    // 2) MAIN
    // -------------------------------
    const mainRaw = await models.generateMain({ date, topic, tone });
    const main = cleanupFinal(mainRaw);

    // -------------------------------
    // 3) OUTRO
    // -------------------------------
    const outroRaw = await models.generateOutro({ date, topic, tone });
    const outro = cleanupFinal(outroRaw);

    // -------------------------------
    // Combine full text BEFORE editorial pass
    // -------------------------------
    const initialFullText = `${intro}\n\n${main}\n\n${outro}`.trim();

    // -------------------------------
    // 4) EDITORIAL PASS
    // -------------------------------
    const editorialResp = await resilientRequest({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert editor. Remove fluff, keep factual clarity, conversational tone, smooth transitions.",
        },
        {
          role: "user",
          content: initialFullText,
        },
      ],
      max_tokens: 4096,
    });

    const editorialText = cleanupFinal(
      extractMainContent(editorialResp?.content || "")
    );

    // -------------------------------
    // 5) FORMATTING PASS (your existing formatter)
    // -------------------------------
    const formattedText =
      models.editAndFormat?.(editorialText) || editorialText;

    // -------------------------------
    // FINAL CLEANUP (NEW, CRITICAL)
    // -------------------------------
    const finalFullText = cleanupFinal(
      formattedText?.trim() ||
        editorialText?.trim() ||
        initialFullText
    );

    // -------------------------------
    // 6) EXPORT TRANSCRIPT TO R2
    // -------------------------------
    const transcriptKey = `${sessionId}.txt`;
    const transcriptUrl = await uploadText(
      "transcript",
      transcriptKey,
      finalFullText
    );

    // -------------------------------
    // 7) STORE METADATA
    // -------------------------------
    const metaKey = `${sessionId}.json`;
    const meta = {
      session: { sessionId, date: new Date().toISOString() },
      transcriptUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      textLength: finalFullText.length,
      topic,
      tone,
    };

    await putJson("meta", metaKey, meta);

    info("✅ Script orchestration complete", {
      sessionId,
      metaKey,
      transcriptKey,
    });

    return {
      ok: true,
      sessionId,
      metaUrls: {
        transcriptUrl,
      },
      text: finalFullText,
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
