// services/script/utils/io.js
import fs from "fs/promises";
import path from "path";
import { info } from "#logger.js";

// Helper to get temp dir for episode
function tmpDir(episodeId) {
  return path.join("/tmp", episodeId);
}

async function ensureTmpDir(episodeId) {
  const dir = tmpDir(episodeId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeRawText({ episodeId, text }) {
  const dir = await ensureTmpDir(episodeId);
  const file = path.join(dir, "raw.txt");
  await fs.writeFile(file, text, "utf8");
  info("tmp.rawText.saved", { file });
  return file;
}

export async function writeChunk({ episodeId, index, text }) {
  const dir = await ensureTmpDir(episodeId);
  const file = path.join(dir, `chunk_${index}.txt`);
  await fs.writeFile(file, text, "utf8");
  info("tmp.chunk.saved", { file });
  return file;
}

export async function writeTranscript({ episodeId, text }) {
  const dir = await ensureTmpDir(episodeId);
  const file = path.join(dir, "transcript.txt");
  await fs.writeFile(file, text, "utf8");
  info("tmp.transcript.saved", { file });
  return file;
}

export async function writeMeta({ episodeId, meta }) {
  const dir = await ensureTmpDir(episodeId);
  const file = path.join(dir, "meta.json");
  await fs.writeFile(file, JSON.stringify(meta, null, 2), "utf8");
  info("tmp.meta.saved", { file });
  return file;
}
