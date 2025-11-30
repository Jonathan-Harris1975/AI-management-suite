// services/script/utils/mainChunker.js
//
// Optional post-processing for chunks.
// Right now we just return them as-is, but this file is kept so the
// rest of the pipeline can call it if needed.

export default function mainChunker(chunks) {
  if (!Array.isArray(chunks)) return [];
  return chunks.map((c) => String(c || "").trim()).filter(Boolean);
}
