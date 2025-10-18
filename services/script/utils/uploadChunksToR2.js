import {s3, BUCKETS as R2_BUCKETS, uploadBuffer, buildPublicUrl} from '../../shared/utils/r2-client.js';
  throw new Error('Missing one or more required R2 environment variables for chunks.');
}



export default async function uploadChunksToR2(filePath, key) {
  const fs = await import('fs');
  const fileContent = fs.readFileSync(filePath);

  const command = new PutObjectCommand({
    Bucket: R2_BUCKETS.RAW,
    Key: key,
    Body: fileContent,
    ContentType: 'text/plain'
  });

  await s3.send(command);

  const url = buildPublicUrl(R2_BUCKETS.META, key) || buildPublicUrl(R2_BUCKETS.RAW, key);
  return url;
