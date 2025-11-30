// ============================================================
// 🎧 chunkText.js — transcript → text chunks for TTS
// ============================================================
//
// Simple, robust chunker:
//   - tries to split on paragraph boundaries
//   - then on sentence boundaries
//   - keeps each chunk under ~2800 chars for Polly Natural
// ============================================================

const MAX_CHARS = 2800;

function splitParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function chunkText(fullText) {
  const chunks = [];
  let current = "";

  const paragraphs = splitParagraphs(fullText);

  const pushCurrent = () => {
    if (current.trim().length > 0) {
      chunks.push(current.trim());
      current = "";
    }
  };

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length <= MAX_CHARS) {
      current = current ? `${current}\n\n${para}` : para;
      continue;
    }

    // too big: split paragraph into sentences
    const sentences = splitSentences(para);
    for (const sent of sentences) {
      const candidate = current ? `${current} ${sent}` : sent;
      if (candidate.length > MAX_CHARS) {
        pushCurrent();
        if (sent.length > MAX_CHARS) {
          // hard cut if we really have a monster sentence
          let remaining = sent;
          while (remaining.length > MAX_CHARS) {
            chunks.push(remaining.slice(0, MAX_CHARS));
            remaining = remaining.slice(MAX_CHARS);
          }
          current = remaining;
        } else {
          current = sent;
        }
      } else {
        current = candidate;
      }
    }
  }

  pushCurrent();
  return chunks;
}
