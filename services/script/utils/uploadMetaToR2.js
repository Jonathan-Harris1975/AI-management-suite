import {s3, BUCKETS as R2_BUCKETS, uploadBuffer, buildPublicUrl} from '../../shared/utils/r2-client.js';
  throw new Error('Missing one or more required R2 environment variables for metadata uploads.');
}



export default async function uploadMetaToR2(sessionId, keySuffix, content) {
  const key = `${sessionId}-${keySuffix}.txt`;

  const command = /* use uploadBuffer helper */

  await s3.send(command);

  const url = buildPublicUrl(R2_BUCKETS.META, key);
  return url;
