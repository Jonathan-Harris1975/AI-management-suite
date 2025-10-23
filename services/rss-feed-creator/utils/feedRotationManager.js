
import { info, error } from "#logger.js";
import { putJson, getObjectAsText, R2_BUCKETS } from "#shared/utils/r2-client.js";

const FEED_ROTATION_FILE = "data/feed-rotation.json";
const RSS_FEED_BUCKET = process.env.R2_BUCKET_RSS_FEEDS || "";

export async function getRotationOffset() {
  try {
    const data = await getObjectAsText(RSS_FEED_BUCKET, FEED_ROTATION_FILE);
    const { offset } = JSON.parse(data);
    info("feedRotationManager.getRotationOffset.success", { offset });
    return offset || 0;
  } catch (err) {
    if (err.message.includes("NoSuchKey")) {
      info("feedRotationManager.getRotationOffset.info", { message: "Rotation file not found, initializing with offset 0." });
      return 0;
    }
    error("feedRotationManager.getRotationOffset.fail", { error: err.message });
    return 0;
  }
}

export async function updateRotationOffset(newOffset) {
  try {
    await putJson(RSS_FEED_BUCKET, FEED_ROTATION_FILE, { offset: newOffset });
    info("feedRotationManager.updateRotationOffset.success", { newOffset });
  } catch (err) {
    error("feedRotationManager.updateRotationOffset.fail", { error: err.message });
    throw err;
  }
}

