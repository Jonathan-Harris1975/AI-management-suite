import { info } from "#logger.js";

export default function chunkText(text) {
  const maxChunk = 2400;
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = "";

  for (const s of sentences) {
    if ((current + s).length > maxChunk) {
      chunks.push(current.trim());
      current = s + " ";
    } else current += s + " ";
  }
  if (current.trim()) chunks.push(current.trim());

  info("🔪 Text chunking complete", { totalChunks: chunks.length });
  return chunks;
}
