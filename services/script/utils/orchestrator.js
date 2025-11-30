// services/script/utils/orchestrator.js
// ============================================================================
// Script Orchestrator – minimal, stable, script-first
// ============================================================================
// - Generates intro + main + outro via models.js
// - Formats text via editAndFormat (inside models)
// - Saves full script to transcripts bucket as {sessionId}.txt
// - Saves basic meta JSON to meta bucket as {sessionId}.json
// ============================================================================

import { info, error } from "#logger.js";
import { generateComposedEpisodeParts, getCallLog } from "./models.js";
import { uploadText, putJson } from "../../shared/utils/r2-client.js";

export async function orchestrateEpisode(payload = {}) {
  const rawSessionId = payload.sessionId;
  const sessionId =
    typeof rawSessionId === "string" && rawSessionId.trim()
      ? rawSessionId.trim()
      : `TT-${new Date().toISOString().slice(0, 10)}`;

  const date = payload.date || new Date().toISOString();
  const topic = payload.topic || "recent developments in artificial intelligence";
  const tone = payload.tone || { style: "balanced" };

  info("script.orchestrate.start", { sessionId, date, topic });

  try {
    // 1) Generate intro + main + outro + formatted
    const { intro, main, outro, formatted } =
      await generateComposedEpisodeParts({ sessionId, date, topic, tone });

    const finalText = formatted?.trim() || `${intro}\n\n${main}\n\n${outro}`.trim();

    // 2) Save transcript to transcripts bucket
    const transcriptKey = `${sessionId}.txt`;
    await uploadText("transcripts", transcriptKey, finalText, "text/plain");

    // 3) Save simple meta JSON
    const metaKey = `${sessionId}.json`;
    const meta = {
      session: {
        sessionId,
        date,
      },
      topic,
      tone,
      lengths: {
        intro: intro?.length || 0,
        main: main?.length || 0,
        outro: outro?.length || 0,
        full: finalText.length,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      callLog: getCallLog(),
    };

    await putJson("meta", metaKey, meta);

    info("script.orchestrate.complete", {
      sessionId,
      transcriptKey,
      metaKey,
    });

    return {
      ok: true,
      sessionId,
      transcriptKey,
      metaKey,
    };
  } catch (err) {
    error("script.orchestrate.fail", {
      sessionId,
      error: err?.message,
      stack: err?.stack,
    });

    return {
      ok: false,
      sessionId,
      error: err?.message || String(err),
    };
  }
}

export default { orchestrateEpisode };
