import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
export default function generateCTA(sponsor) {
  return `Curious to dive deeper into "${sponsor.title}"? Head over to jonathan-harris.online — you'll find the full ebook collection, AI updates, and the newsletter signup. No spam, just sharp insights.`;
}
