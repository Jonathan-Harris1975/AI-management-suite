
// Cloudflare R2 client using AWS SDK v3 (production)
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const endpoint = process.env.R2_ENDPOINT || process.env.CF_R2_ENDPOINT;
const region = process.env.R2_REGION || "auto";
const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

const client = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey }
});

export async function putObject(bucket, key, body, contentType = "application/octet-stream"){
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType
  });
  await client.send(cmd);
  return { bucket, key };
}

export async function uploadText(bucket, key, text, contentType = "text/plain"){
  const buf = Buffer.from(text);
  return putObject(bucket, key, buf, contentType);
}

export default { putObject, uploadText };
