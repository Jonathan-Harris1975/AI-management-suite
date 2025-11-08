
# Local Pipeline Smoke Test

This repo was patched with a **minimal working pipeline** that does not call external APIs.
It writes outputs under `./local-out/`.

## How to run

```bash
node scripts/runLocalPipeline.js my-session
# or
npm run pipeline
```

Expected outputs:
- `local-out/raw-text/<session>.txt`
- `local-out/podcast/<session>.mp3` (tiny placeholder file)
- `local-out/artwork/<session>.png` (1x1 PNG)
- `local-out/meta/<session>.meta.json`
- `local-out/transcripts/<session>.vtt`
