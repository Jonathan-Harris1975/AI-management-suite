// services/script/utils/mainChunker.js
import { resilientRequest } from "../../shared/utils/ai-service.js";
import { getMainPrompt } from "./promptTemplates.js";
import { cleanTranscript } from "./textHelpers.js";
import * as sessionCache from "./sessionCache.js";
import { info, debug } from "#logger.js";

/**
 * Split array into chunks of size n (last chunk may be smaller)
 */
function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Build synthesis prompt to merge all mini-editorials into one coherent MAIN.
 */
function buildMainSynthesisPrompt(sessionMeta, segments, totalMainSeconds) {
  const minutes = Math.max(10, Math.round((totalMainSeconds || 1800) / 60));
  const approxWords = Math.round((totalMainSeconds || 1800) * 2.3); // ~2.3 w/s

  const joinedSegments = segments
    .map((seg) => seg.trim())
    .filter(Boolean)
    .join("\n\n---\n\n");

  return `
You are hosting a long-form British radio-style podcast main segment.

You are given several short editorial segments, each based on different AI-related news stories from this week. These segments are rough draft material only.

Your job is to rewrite them into ONE single, coherent MAIN SECTION monologue for the show:
- Target length: about ${minutes} minutes (~${approxWords} words)
- Tone: dry, sceptical, witty British radio host, Gen-X vibe without ever naming generations
- Style: BBC-meets-WIRED, intelligent and conversational

STRICT RULES:
- Do NOT mention "segments", "batches", or any internal structure.
- Do NOT reference article numbers or lists like "article 1, article 2" or "first/second/third".
- Group related ideas into 2–4 clear themes only.
- If multiple segments cover similar ground, MERGE them into one unified treatment and mention the idea only once.
- Avoid repetition: do not restate the same argument, concern, or example in different words.
- No bullets, no numbered lists, no "first up / next up / finally".
- No fictional scenes, no hypotheticals; this is editorial analysis, not storytelling.
- Keep paragraphs short and spoken-language friendly.
- Maintain a smooth flow from theme to theme with natural transitions.

SOURCE DRAFT SEGMENTS (separated by ---):
${joinedSegments}

Now write the FINAL MAIN SECTION as a single continuous monologue, plain text only.
`.trim();
}

/**
 * Generate long-form MAIN section by chunking articles and calling the LLM
 * for each group, then running a final synthesis pass to combine everything
 * into one coherent long-form main section.
 *
 * Batch size is 1: one mini-editorial per article, then merged.
 */
export async function generateMainLongform(sessionMeta, articles, totalMainSeconds) {
  if (!articles?.length) return "";

  // ✅ Batch size = 1 (your choice)
  const groupSize = 1;
  const groups = chunk(articles, groupSize);

  // Basic per-group target seconds, in case we want to hint length later
  const buffer = Math.min(180, Math.round((totalMainSeconds || 1800) * 0.05));
  const perGroupSeconds = Math.max(
    240,
    Math.floor(((totalMainSeconds || 1800) - buffer) / groups.length)
  );

  debug("script.main.chunking", {
    groups: groups.length,
    perGroupSeconds,
    totalMainSeconds,
    groupSize,
  });

  const parts = [];

  // 1) Per-article mini editorials
  for (let i = 0; i < groups.length; i++) {
    const prompt = getMainPrompt({
      sessionMeta,
      articles: groups[i],
      targetSeconds: perGroupSeconds,
      batchIndex: i + 1,
      totalBatches: groups.length,
    });

    const res = await resilientRequest(`scriptMain-${i + 1}`, {
      sessionId: sessionMeta,
      section: `main-chunk-${i + 1}`,
      messages: [{ role: "system", content: prompt }],
    });

    const cleaned = cleanTranscript(String(res || ""));
    parts.push(cleaned);

    await sessionCache.storeTempPart(
      sessionMeta,
      `main-chunk-${i + 1}`,
      cleaned
    );
  }

  // 2) Final synthesis into one long-form MAIN
  const synthesisPrompt = buildMainSynthesisPrompt(
    sessionMeta,
    parts,
    totalMainSeconds
  );

  const synthesisRes = await resilientRequest("scriptMain-synthesis", {
    sessionId: sessionMeta,
    section: "main-synthesis",
    messages: [{ role: "system", content: synthesisPrompt }],
  });

  const finalCombined = cleanTranscript(
    String(synthesisRes || parts.join("\n\n"))
  );

  await sessionCache.storeTempPart(sessionMeta, "main", finalCombined);

  info("script.main.longform.complete", {
    sessionId: sessionMeta?.sessionId || String(sessionMeta),
    segments: parts.length,
  });

  return finalCombined;
}

export default { generateMainLongform };
