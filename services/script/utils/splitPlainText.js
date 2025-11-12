import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
export default function splitPlainText(text, maxLength = 2500) {
  const chunks = [];
  let current = '';

  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if ((current + sentence).length <= maxLength) {
      current += (current ? ' ' : '') + sentence;
    } else {
      if (current) chunks.push(current.trim());
      current = sentence;
    }
  }

  if (current) chunks.push(current.trim());
  return chunks;
}
