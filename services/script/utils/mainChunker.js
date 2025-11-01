// services/script/utils/mainChunker.js
import { resilientRequest } from "../../shared/utils/ai-service.js";
import { getMainPrompt } from "./promptTemplates.js";
import { putText } from "../../shared/utils/r2-client.js";
import { cleanTranscript } from "./textHelpers.js";
import { info } from "#logger.js";

/**
 * Split array into chunks of size n (last chunk may be smaller)
 */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Generate long-form MAIN section by chunking articles and calling the LLM
 * for each group. Returns combined text.
 */
export async function generateMainLongform(sessionMeta, articles, totalMainSeconds) {
  if (!articles?.length) return "";

  // Prefer 3–4 per group for depth without bloat
  const groupSize = articles.length >= 16 ? 4 : 3;
  const groups = chunk(articles, groupSize);

  // Allocate time fairly per group (reserve small buffer for transitions)
  const buffer = Math.min(180, Math.round(totalMainSeconds * 0.05)); // up to 3 minutes
  const perGroupSeconds = Math.max(420, Math.floor((totalMainSeconds - buffer) / groups.length)); // ≥7 min per chunk

  info("script.main.chunking", {
    groups: groups.length,
    perGroupSeconds,
    totalMainSeconds,
    groupSize,
  });

  const parts = [];
  for (let i = 0; i < groups.length; i++) {
    const prompt = getMainPrompt({
      sessionMeta,
      articles: groups[i],
      mainSeconds: perGroupSeconds,
    });

    const res = await resilientRequest(`scriptMain-${i + 1}`, {
      sessionId: sessionMeta,
      section: `main-chunk-${i + 1}`,
      messages: [{ role: "system", content: prompt }],
    });

    const cleaned = cleanTranscript(String(res || ""));
    const fname = `${sessionMeta.sessionId}-main-chunk-${String(i + 1).padStart(2, "0")}.txt`;
    await putText("raw-text", fname, cleaned);
    parts.push(cleaned);
  }

  // Merge with light transition whitespace
  const combined = parts.join("\n\n");
  await putText("raw-text", `${sessionMeta.sessionId}-main.txt`, combined);
  return combined;
}

export default { generateMainLongform };
