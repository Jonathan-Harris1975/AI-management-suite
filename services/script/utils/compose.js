import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/compose.js
import uploadMetaToR2 from './uploadMetaToR2.js';

/**
 * Assemble a final podcast script from intro, main, outro.
 * Uploads metadata (title, description, seoKeywords, artworkPrompt) to R2.
 */
export default async function compose({
  intro,
  main,
  outro,
  date,
  sessionId,
  title,
  description,
  seoKeywords,
  artworkPrompt
}) {
  const script = [intro, main, outro].filter(Boolean).join('\n\n');

  const metaUrls = {};
  if (sessionId) {
    try {
      if (title) metaUrls.title = await uploadMetaToR2(sessionId, 'title', title);
      if (description) metaUrls.description = await uploadMetaToR2(sessionId, 'description', description);
      if (seoKeywords) metaUrls.seoKeywords = await uploadMetaToR2(sessionId, 'seokeywords', seoKeywords);
      if (artworkPrompt) metaUrls.artworkPrompt = await uploadMetaToR2(sessionId, 'artworkprompt', artworkPrompt);

      const combinedMeta = JSON.stringify({ title, description, seoKeywords, artworkPrompt, date }, null, 2);
      metaUrls.full = await uploadMetaToR2(sessionId, 'meta', combinedMeta);
    } catch (err) {
      console.error(`❌ Failed to upload metadata for session ${sessionId}:`, err);
    }
  }

  return { script, metaUrls };
}
