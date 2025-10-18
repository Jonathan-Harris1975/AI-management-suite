import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "#shared/r2-client.js";
// utils/orchestrator.js
import { processTTS } from "./ttsProcessor.js";
import { mergeChunks } from "./mergeprocessor.js";
import { processEditing } from "./editingProcessor.js";
import { processPodcast } from "./podcastProcessor.js";

import * as logger from "#shared/logger.js";

/**
 * Main orchestration function
 */
async function processPodcastPipeline(sessionId, text) {
  try {
    // 1. Generate TTS
    await processTTS(sessionId, text);

    // 2. Get chunk list
    const chunkKeys = await listChunks(sessionId);

    // 3. Merge chunks into one file
    await mergeChunks(sessionId, chunkKeys);

    // 4. Run editing on the merged file
    await processEditing(sessionId);

    // 5. Build final podcast
    const podcastResult = await processPodcast(sessionId);

    return podcastResult;
  } catch (err) {
    logger.error(`❌ Podcast pipeline failed for ${sessionId}: ${err.message}`);
    throw err;
  }
}

export { processPodcastPipeline };
