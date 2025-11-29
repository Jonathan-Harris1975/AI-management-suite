// services/script/utils/orchestrator.js
// ============================================================================
// Orchestrates intro → main → outro → compose → transcript upload
// ============================================================================

import { generateComposedEpisodeParts } from "./models.js";
import { putText, putJson } from "../../shared/utils/r2-client.js";
import { info, error } from "#logger.js";

export async function orchestrateEpisode(args = {}) {
  const sessionId = args.sessionId || "NO-SESSION";

  try {
    info("script.orchestrate.start", { sessionId });

    // 1) Generate all parts
    const { intro, main, outro, formatted, callLog } =
      await generateComposedEpisodeParts(args);

    // 2) Upload transcript
    const transcriptKey = `${sessionId}.txt`;
    await putText("rawtext", transcriptKey, formatted, "text/plain");

    // 3) Metadata
    const metaKey = `${sessionId}.json`;
    const meta = {
      sessionId,
      intro,
      main,
      outro,
      full: formatted,
      callLog,
      createdAt: new Date().toISOString(),
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
      error: err.message,
      stack: err.stack,
    });

    return {
      ok: false,
      sessionId,
      error: err.message,
    };
  }
}
