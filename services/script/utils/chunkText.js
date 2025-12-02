// ============================================================
// 🎧 services/script/utils/chunkText.js
// ============================================================
// Production-grade text chunker for AWS Polly Natural TTS
// - AWS Polly Natural limit: 6000 characters (plain text)
// - Character-based splitting optimized for natural voices
// - Preserves sentence integrity and paragraph structure
// - Zero dependencies, optimal memory usage
// - Comprehensive edge case handling
// ============================================================

import { info, debug } from "#logger.js";

/**
 * Chunks text for AWS Polly Natural voice synthesis with intelligent splitting
 * @param {string} text - Input text to chunk
 * @param {number} maxChars - Maximum characters per chunk (AWS Polly Natural limit: 6000)
 * @returns {string[]} Array of text chunks
 */
export default function chunkText(text, maxChars = Number(process.env.MAX_POLLY_NATURAL_CHUNK_CHARS || 5800)) {
  // Input validation
  if (!text || typeof text !== "string") return [];
  if (text.trim().length === 0) return [];

  const chunks = [];
  const getCharLength = (str) => str.length;
  
  // Normalize text: standardize line breaks, remove excessive whitespace
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Handle text smaller than max size
  if (getCharLength(normalized) <= maxChars) {
    info("✓ Text fits in single chunk", { 
      characters: getCharLength(normalized),
      limit: maxChars
    });
    return [normalized];
  }

  debug(`📝 Splitting text into chunks (${getCharLength(normalized)} characters total)`);

  // Strategy selection: paragraph-first, then sentence-based
  const hasParagraphs = /\n\s*\n/.test(normalized);
  const primaryBlocks = hasParagraphs
    ? normalized.split(/\n\s*\n/)
    : splitIntoSentences(normalized);

  let currentChunk = "";
  let chunkCount = 0;

  for (let i = 0; i < primaryBlocks.length; i++) {
    const block = primaryBlocks[i].trim();
    if (!block) continue;

    const blockSize = getCharLength(block);
    
    // Handle oversized blocks (longer than maxChars)
    if (blockSize > maxChars) {
      // Flush current chunk if exists
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        chunkCount++;
        currentChunk = "";
      }

      // Subdivide oversized block by sentences
      const sentences = splitIntoSentences(block);
      
      for (const sentence of sentences) {
        const sentenceSize = getCharLength(sentence);
        
        // Emergency: if single sentence exceeds limit, split by words
        if (sentenceSize > maxChars) {
          debug(`⚠️  Found very long sentence (${sentenceSize} chars) - splitting by words`);
          const wordChunks = splitByWords(sentence, maxChars, getCharLength);
          wordChunks.forEach(wc => {
            chunks.push(wc);
            chunkCount++;
          });
          continue;
        }

        // Try to add sentence to current chunk
        const testChunk = currentChunk 
          ? `${currentChunk} ${sentence}`
          : sentence;

        if (getCharLength(testChunk) > maxChars) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
            chunkCount++;
          }
          currentChunk = sentence;
        } else {
          currentChunk = testChunk;
        }
      }
      continue;
    }

    // Normal block processing
    const separator = hasParagraphs ? "\n\n" : " ";
    const testChunk = currentChunk 
      ? `${currentChunk}${separator}${block}`
      : block;
    
    const testSize = getCharLength(testChunk);

    if (testSize > maxChars) {
      // Flush current chunk
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        chunkCount++;
      }
      currentChunk = block;
    } else {
      currentChunk = testChunk;
    }
  }

  // Push final chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
    chunkCount++;
  }

  // Validation pass: ensure no chunk exceeds limit
  const validatedChunks = [];
  for (const chunk of chunks) {
    if (getCharLength(chunk) > maxChars) {
      // Emergency re-split
      debug(`⚠️  Chunk exceeded limit during validation - re-splitting`);
      const subChunks = splitByWords(chunk, maxChars, getCharLength);
      validatedChunks.push(...subChunks);
    } else {
      validatedChunks.push(chunk);
    }
  }

  // Enhanced human-friendly logging
  debug(`\n📊 Created ${validatedChunks.length} chunk${validatedChunks.length > 1 ? 's' : ''} for TTS processing:\n`);
  
  validatedChunks.forEach((chunk, idx) => {
    const chars = getCharLength(chunk);
    const percentage = ((chars / maxChars) * 100).toFixed(0);
    const preview = chunk.length > 50 
      ? `${chunk.slice(0, 50)}...` 
      : chunk;
    
    // Visual bar representation
    const barLength = 20;
    const filledBars = Math.round((chars / maxChars) * barLength);
    const bar = '█'.repeat(filledBars) + '░'.repeat(barLength - filledBars);
    
    debug(`  Chunk ${idx + 1}/${validatedChunks.length}: ${chars} chars [${bar}] ${percentage}% full`);
    debug(`    "${preview}"`);
  });

  debug(`\n✓ All chunks ready for AWS Polly synthesis\n`);

  return validatedChunks;
}

/**
 * Split text into sentences using multiple delimiters
 * Handles abbreviations and edge cases
 */
function splitIntoSentences(text) {
  // Enhanced regex: captures sentences ending with .!? followed by space or end
  // Handles common abbreviations (Mr., Dr., etc.)
  const sentences = [];
  
  // Pattern: sentence-ending punctuation followed by whitespace or EOL
  // Negative lookbehind for common abbreviations
  const regex = /(?<!\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|Inc|Ltd|Co|approx)\.)([.!?]+)(?=\s+[A-Z]|\s*$)/g;
  
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const endIndex = match.index + match[0].length;
    sentences.push(text.slice(lastIndex, endIndex).trim());
    lastIndex = endIndex;
  }

  // Capture remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) sentences.push(remaining);
  }

  return sentences.length > 0 ? sentences : [text];
}

/**
 * Emergency word-based splitting for extremely long sentences
 * Ensures no chunk exceeds maxChars
 */
function splitByWords(text, maxChars, getCharLength) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    
    if (getCharLength(test) > maxChars) {
      if (current) {
        chunks.push(current);
        current = word;
      } else {
        // Single word exceeds limit (rare): truncate with ellipsis
        const truncated = truncateToChars(word, maxChars - 3, getCharLength) + "...";
        chunks.push(truncated);
        current = "";
      }
    } else {
      current = test;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/**
 * Truncate string to specified character length
 */
function truncateToChars(str, maxChars, getCharLength) {
  if (getCharLength(str) <= maxChars) return str;
  return str.slice(0, maxChars);
}
