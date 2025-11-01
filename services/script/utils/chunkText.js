// ============================================================
// 🎧 services/script/utils/chunkText.js
// ============================================================
// Smarter chunker for TTS + SSML pipelines
// - Splits by paragraph first, then sentence if too large
// - Ensures each chunk ≤ MAX_SSML_CHUNK_BYTES (default 4200)
// - Never cuts a sentence mid-way
// - Returns clean array of text chunks ready for upload
// ============================================================

import { info } from "#logger.js";

export default function chunkText(text, maxBytes = Number(process.env.MAX_SSML_CHUNK_BYTES || 4200)) {
  if (!text || typeof text !== "string") return [];

  const chunks = [];
  let current = "";

  // First pass — split by paragraphs (or sentences if none)
  const hasParagraphs = text.includes("\n\n");
  const blocks = hasParagraphs
    ? text.split(/\n\s*\n/)
    : text.split(/(?<=[.!?])\s+/); // fallback: sentence split

  const getBytes = (str) => Buffer.byteLength(str, "utf8");

  for (const block of blocks) {
    const blockBytes = getBytes(block);

    // if block itself too long, further subdivide by sentences
    if (blockBytes > maxBytes) {
      const sentences = block.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if (getBytes(current + s) > maxBytes) {
          if (current.trim()) chunks.push(current.trim());
          current = "";
        }
        current += s + " ";
      }
      continue;
    }

    // normal case
    if (getBytes(current + block) > maxBytes) {
      chunks.push(current.trim());
      current = "";
    }
    current += block + "\n\n";
  }

  if (current.trim()) chunks.push(current.trim());

  // Log chunk metadata
  chunks.forEach((c, i) => {
    info("tts.chunk", { index: i + 1, bytes: getBytes(c), preview: c.slice(0, 60) + "..." });
  });

  return chunks;
}
