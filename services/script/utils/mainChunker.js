// services/script/utils/mainChunker.js
import { resilientRequest } from "../../shared/utils/ai-service.js";
import { getMainPrompt } from "./promptTemplates.js";
import { cleanTranscript } from "./textHelpers.js";
import * as sessionCache from "./sessionCache.js";
import { info,debug } from "#logger.js";

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
 * for each group. Stores each chunk in temporary session cache, and returns
 * the combined text (no R2 writes here).
 */
export async function generateMainLongform(sessionMeta, articles, totalMainSeconds) {
  if (!articles?.length) return "";

  const groupSize = articles.length >= 16 ? 4 : 3;
  const groups = chunk(articles, groupSize);

  const buffer = Math.min(180, Math.round(totalMainSeconds * 0.05));
  const perGroupSeconds = Math.max(420, Math.floor((totalMainSeconds - buffer) / groups.length));

  debug("script.main.chunking", {
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
    parts.push(cleaned);

    await sessionCache.storeTempPart(sessionMeta, `main-chunk-${i + 1}`, cleaned);
  }

  const combined = parts.join("\n\n");
  await sessionCache.storeTempPart(sessionMeta, "main", combined);
  return combined;
}

export default { generateMainLongform };
