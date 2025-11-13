import { warn } from "#logger.js";
import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// Fully isolated — not visible to Shiper build resolver
export async function getSignedUrl(r2Client, bucket, key, expiresIn) {
  try {
    // hide the import string from static scanners
    const pkg = ["@aws-sdk", "s3-request-presigner"].join("/");
    const presigner = await import(pkg);
    const { getSignedUrl } = presigner;
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    return await getSignedUrl(r2Client, cmd, { expiresIn });
  } catch (err) {
    warn("⚙️ Presigner unavailable – safe mode active.", { error: err.message });
    return null;
  }
}
