
// 🎨 Artwork generator — Minimal Working Stub
import { putObject } from "#shared/r2-client.js";

export async function generateArtwork(sessionId, opts = {}){
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5cB/kAAAAASUVORK5CYII=", "base64");
  const key = `${sessionId}.png`;
  await putObject("artwork", key, png, "image/png");
  return { ok: true, key };
}
export default generateArtwork;
