import {s3, BUCKETS as R2_BUCKETS, uploadBuffer, buildPublicUrl} from '../../shared/utils/r2-client.js';
  throw new Error('Missing one or more required R2 environment variables for transcripts.');
}



export default async function uploadToR2(filePath, key) {
  const fs = await import('fs');
  const fileContent = fs.readFileSync(filePath);

  const command = /* use uploadBuffer helper */

  await s3.send(command);

  const url = buildPublicUrl(R2_BUCKETS.RAW, key);
  return url;
