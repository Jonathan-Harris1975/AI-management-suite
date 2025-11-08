
// 🔊 TTS Orchestrator — Minimal Working Stub (writes tiny MP3 placeholder)
import { putObject, uploadText } from "#shared/r2-client.js";

function tinyMp3(){
  // Minimal ID3v2 header with zero-sized tag; not playable, but fine for pipelines
  const header = Buffer.from([0x49,0x44,0x33, 0x03,0x00, 0x00, 0x00,0x00,0x00,0x00]);
  return Buffer.concat([header, Buffer.from("TURINGTORCH")]);
}

export async function orchestrateTTS(sessionId, { scriptText } = {}){
  const mp3 = tinyMp3();
  const key = `${sessionId}.mp3`;
  await putObject("podcast", key, mp3, "audio/mpeg");
  await uploadText("transcripts", `${sessionId}.vtt`, "WEBVTT\n\n00:00.000 --> 00:01.000\nIntro...", "text/vtt");
  return { ok: true, sessionId, file: key, durationSec: 1 };
}

export default orchestrateTTS;
