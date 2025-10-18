# services/script (aligned with shared utils)

This folder is a drop-in replacement for your existing `services/script` service, updated to:
- Use **shared** OpenRouter routing: `services/shared/utils/ai-service.js` + `ai-config.js`
- Use **shared** R2 client: `services/shared/utils/r2-client.js`
- Keep your **tone** logic local (`utils/tone.js`) — unchanged in spirit
- Save artifacts to the **correct buckets**:
  - Drafts: `R2_BUCKET_RAW_TEXT`
  - Final chunks: `R2_BUCKET_CHUNKS`
  - Transcripts: `R2_BUCKET_TRANSCRIPTS`
  - Metadata: `R2_BUCKET_META`

## What changed

- Replaced any local R2/model/logger utilities with imports from `../../shared/utils/*`.
- All model calls go through `resilientRequest(...)` with **route-specific** model chains:
  - `routeModels.scriptIntro` (fallback -> `routeModels.scriptGenerate` -> `routeModels.rewrite`)
  - `routeModels.scriptMain` (fallback -> `routeModels.scriptGenerate` -> `routeModels.rewrite`)
  - `routeModels.scriptOutro` (fallback -> `routeModels.scriptGenerate` -> `routeModels.rewrite`)
  - `routeModels.scriptSummarize` (fallback -> `routeModels.scriptGenerate` -> `routeModels.rewrite`)

These respect your environment variables for OpenRouter keys and model order.

## Files considered redundant (safe to delete in your repo if present)

- `services/script/utils/r2.js` (replaced by `../../shared/utils/r2-client.js`)
- `services/script/utils/modelConfig.js` or `openrouter.js` (replaced by `../../shared/utils/ai-config.js`)
- `services/script/utils/logger.js` (replaced by `../../shared/utils/logger.js`)

> If your repo still contains any of those files, they are no longer used by this implementation.

## Environment variables used

- `R2_BUCKET_RAW_TEXT`
- `R2_BUCKET_CHUNKS`
- `R2_BUCKET_TRANSCRIPTS`
- `R2_BUCKET_META`

No changes required to your global OpenRouter envs — they are read by `services/shared/utils/ai-config.js` and `ai-service.js`.

## Public API

- `compose.js` exports `composeScript({ sessionId, topic, tone, sections })`
- `intro.js` exports `generateIntro(params)`
- `main.js` exports `generateMain(params)`
- `outro.js` exports `generateOutro(params)`
- `summarize.js` exports `summarizeScript(params)`

All functions are **async** and return structured JSON. The compose step writes artifacts to the correct buckets and returns `{ ok, ids, meta }`.
