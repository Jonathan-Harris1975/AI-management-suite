import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
export default function generateCta(book) {
  const safeTitle = book?.title?.replace(/[-]/g, ' ') ?? 'this topic';

  return `Curious to explore "${safeTitle}" and more? Head over to https://jonathan-harris.online — you'll find my full ebook collection, daily AI newsletter, and plenty of sharp, spam-free insights.`;
}
