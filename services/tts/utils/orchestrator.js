// ============================================================
// 🎬 TTS Orchestrator — Full Audio Generation Pipeline (FIXED)
// ============================================================
//
// This version includes the critical fix: it now DOWNLOADS the
// .txt chunk contents from R2 and passes:
//
//     { key, text }
//
// to the ttsProcessor. Previously, chunk.text was undefined,
// causing ALL TTS chunks to fail with `.replace()` errors.
//
// Features:
//   - Loads & validates text chunks
//   - Runs TTS processor
//   - Runs merge processor
//   - Runs editing processor
//   - Runs podcastProcessor for final mixdown
//   - Uploads final MP3 to R2
//   - Full logging (message-first)
// ============================================================

import { info, error, debug } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";
import { listKeys, getObject, putObject } from "#shared/r2-client.js";
import { ttsProcessor } from "./ttsProcessor.js";
import { mergeProcessor } from "./mergeProcessor.js";
import { editingProcessor } from "./editingProcessor.js";
import { podcastProcessor } from "./podcastProcessor.js";

// ENV
const RAW_TEXT_BUCKET =
  process.env.R2_BUCKET_RAW_TEXT || process.env.R2_BUCKET_RAW_TEXT_INPUT;
const RAW_TEXT_BASE_URL = process.env.R2_PUBLIC_BASE_URL_RAW_TEXT;

const FINAL_BUCKET =
  process.env.R2_BUCKET_PODCAST || process.env.R2_BUCKET_PODCAST_OUTPUT;
const PUBLIC_BASE_URL_PODCAST =
  process.env.R2_PUBLIC_BASE_URL_PODCAST || process.env.R2_PUBLIC_BASE_URL_PODCAST_OUTPUT;

// --------------------------
// 5️⃣ Podcast Mixdown + Mastering
// --------------------------
const t4 = Date.now();
const final = await podcastProcessor(sessionId, editedBuffer);

const finalBuffer = final?.buffer || final;
const finalKey = final?.key || `${sessionId}_podcast.mp3`;
const finalUrl =
  final?.url ||
  (PUBLIC_BASE_URL_PODCAST
    ? `${PUBLIC_BASE_URL_PODCAST}/${encodeURIComponent(finalKey)}`
    : undefined);

if (!finalBuffer || !finalBuffer.length) {
  throw new Error("Mixdown step returned no audio data.");
}

info("🎚️ final podcast audio ready");
debug("🎚️ Mixdown complete", {
  sessionId,
  bytes: finalBuffer.length,
  key: finalKey,
  url: finalUrl,
  ms: Date.now() - t4,
});

stopKeepAlive("ttsProcessor");
return { ok: true, sessionId, key: finalKey, url: finalUrl };
  } catch (err) {
    error("💥 TTS orchestration failed", {
      sessionId,
      error: err?.stack || err?.message,
    });

    stopKeepAlive("ttsProcessor");
    throw err;
  }
}

export default orchestrateTTS;
