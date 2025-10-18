import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../shared/utils/r2-client.js";
import { log } from "../../utils/logger.js";
export async function runScript({ sessionId, nowISO }) {
  log.info({ sessionId, nowISO }, "📝 [Script] start");
  // TODO: connect to your existing script logic
}
