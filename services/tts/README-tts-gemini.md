# TTS Service – Gemini-only

## Environment
- `GEMINI_API_KEY` (required)
- `GEMINI_TTS_VOICE` (optional, default: `Charon`)

## Voice
Use Gemini prebuilt voice names, e.g. `Charon`, `Puck`, etc.

## Endpoints
- `POST /tts/generate` { text, voiceName? } → returns tmp file path to synthesized PCM (convert upstream as needed)

## Batch Pipeline
Use `utils/ttsProcessor.processTTS(sessionId, { voiceName })` to synthesize text chunks from R2 and upload mp3 chunks back to R2.
