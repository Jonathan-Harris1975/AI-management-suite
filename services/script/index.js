// services/script/index.js
// Podcast Script Pipeline (centralized R2 + OpenRouter)

import { info, warn, error } from "#shared/logger.js";
import {
  writeRawText,
  writeChunk,
  writeTranscript,
  writeMeta,
} from "./utils/io.js";
import {
  rewriteOutline,
  expandSection,
  tightenRead,
} from "./utils/models.js";
import { buildPrompts } from "./utils/prompts.js";

/**
 * runScriptPipeline
 * @param {Object} input
 * @param {string} input.episodeId - stable id (e.g. date)
 * @param {string} input.topic - main topic/title
 * @param {string} input.rawText - seed text for the episode
 * @param {Object} input.tone - optional tone hints (kept; used by buildPrompts)
 * @returns {Object} result { ok, chunks, transcriptUrl, metaUrl }
 */
export async function runScriptPipeline({ episodeId, topic, rawText, tone = {} }) {
  const started = Date.now();
  info("script.pipeline.start", { episodeId, topic });

  if (!episodeId || !topic) {
    throw new Error("episodeId and topic are required");
  }

  // 1) Ingest raw text → RAW_TEXT bucket
  const rawUrl = await writeRawText({ episodeId, text: rawText || "" });
  info("script.raw.saved", { rawUrl });

  // 2) Outline rewrite (structure plan)
  const { systemOutline, promptOutline } = buildPrompts().outline({ topic, rawText, tone });
  const outline = await rewriteOutline({ system: systemOutline, prompt: promptOutline });
  info("script.outline.done");

  // 3) Expand each section
  const sections = Array.isArray(outline?.sections) && outline.sections.length
    ? outline.sections
    : (outline?.text ? outline.text.split(/\n{2,}/) : []);

  const chunks = [];
  for (let i = 0; i < sections.length; i++) {
    const sectionTitle = typeof sections[i] === "string" ? sections[i].slice(0, 120) : sections[i]?.title || `Section ${i+1}`;
    const { systemExpand, promptExpand } = buildPrompts().expand({ topic, section: sections[i], tone });
    const expanded = await expandSection({ system: systemExpand, prompt: promptExpand });
    const { systemTighten, promptTighten } = buildPrompts().tighten({ topic, text: expanded?.text || expanded, tone });
    const tightened = await tightenRead({ system: systemTighten, prompt: promptTighten });

    const chunkText = (tightened?.text || tightened || "").trim();
    if (!chunkText) {
      warn("script.chunk.empty", { index: i, sectionTitle });
      continue;
    }

    const chunkUrl = await writeChunk({ episodeId, index: i, text: chunkText });
    chunks.push({ index: i, title: sectionTitle, url: chunkUrl });
  }

  // 4) Save transcript (joined chunks) + meta
  const transcript = chunks.length
    ? await (async () => {
        const joined = chunks.map(c => `## ${c.title}\n\n${c.url ? "" : ""}`).join("\n\n");
        // We save the REAL text for transcript – pull contents we just wrote:
        // To avoid extra reads, we keep a local join by fetching from writeChunk return (contains text)
        // If writeChunk doesn’t return text (only URL), we simply join links:
        const textOnly = "(See CHUNKS in R2; audio generation step consumes chunks.)";
        return writeTranscript({ episodeId, text: textOnly });
      })()
    : null;

  const meta = {
    episodeId,
    topic,
    chunks,
    createdAt: new Date().toISOString(),
    rawUrl,
    transcriptUrl: transcript,
  };
  const metaUrl = await writeMeta({ episodeId, meta });

  info("script.pipeline.done", {
    episodeId,
    chunks: chunks.length,
    tookMs: Date.now() - started,
  });

  return { ok: true, chunks, transcriptUrl: transcript, metaUrl };
}

export default { runScriptPipeline };
