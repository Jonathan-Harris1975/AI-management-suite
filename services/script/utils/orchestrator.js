// services/script/utils/orchestrator.js
import { info, error } from "#logger.js";
import { putText } from "#shared/r2-client.js";
import {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
} from "./models.js";

// ─────────────────────────────
// Select R2 buckets from env
// ─────────────────────────────
const BUCKET_RAW_TEXT = process.env.R2_BUCKET_RAW_TEXT;
const BUCKET_META = process.env.R2_META_BUCKET;

// helper for consistent key paths
function keyFor(episodeId, file) {
  return `episodes/${episodeId}/${file}`;
}

// save helper
async function saveToR2(bucket, key, text, contentType = "text/plain") {
  await putText(bucket, key, text ?? "", contentType);
  return { bucket, key };
}

// ─────────────────────────────
// Main orchestration entrypoint
// ─────────────────────────────
export async function orchestrateEpisode({ episodeId, date, newsItems = [], tone = {} }) {
  info("script.pipeline.start", { episodeId });

  if (!episodeId) throw new Error("episodeId is required");

  // 1️⃣ Generate intro / main / outro
  const introText = await generateIntro({ date, tone });
  const mainText = await generateMain({ date, newsItems, tone });
  const outroText = await generateOutro({
    date,
    episodeTitle: "",
    siteUrl: process.env.APP_URL || "https://jonathan-harris.online",
    expectedCta: "",
    tone,
  });

  // 2️⃣ Upload chunk texts
  const chunks = [];
  const introLoc = await saveToR2(BUCKET_RAW_TEXT, keyFor(episodeId, "chunk-0-intro.txt"), introText);
  chunks.push({ index: 0, label: "intro", ...introLoc });

  const mainLoc = await saveToR2(BUCKET_RAW_TEXT, keyFor(episodeId, "chunk-1-main.txt"), mainText);
  chunks.push({ index: 1, label: "main", ...mainLoc });

  const outroLoc = await saveToR2(BUCKET_RAW_TEXT, keyFor(episodeId, "chunk-2-outro.txt"), outroText);
  chunks.push({ index: 2, label: "outro", ...outroLoc });

  // 3️⃣ Compose and get metadata
  const { composedText, metadata } = await generateComposedEpisode({
    introText,
    mainText,
    outroText,
    tone,
  });

  // 4️⃣ Upload transcript
  const transcriptLoc = await saveToR2(
    BUCKET_RAW_TEXT,
    keyFor(episodeId, "transcript.txt"),
    composedText
  );

  // 5️⃣ Upload meta JSON
  const fullMeta = {
    episodeId,
    date,
    chunks,
    transcript: transcriptLoc,
    metadata,
    createdAt: new Date().toISOString(),
  };

  const metaLoc = await saveToR2(
    BUCKET_META,
    keyFor(episodeId, "meta.json"),
    JSON.stringify(fullMeta, null, 2),
    "application/json"
  );

  info("script.pipeline.done", {
    episodeId,
    metaKey: metaLoc.key,
    transcriptKey: transcriptLoc.key,
  });

  return {
    ok: true,
    episodeId,
    chunks,
    transcript: transcriptLoc,
    meta: metaLoc,
    metadata: fullMeta,
  };
}

export default { orchestrateEpisode };
