# Text-to-Speech (TTS)

Turns the script into audio assets using Google Gemini 2.5 TTS.

## 🧩 Role
Consume script text and output chunked/merged audio files.

## 🔗 Inputs → Outputs
- **Reads**: `raw-text` bucket
- **Writes**: `podcast-chunks`, `podcast-merged`, `podcast` buckets

## ☁️ R2 Usage
- Uses the shared client: `import { s3, R2_BUCKETS, uploadBuffer, listKeys } from "../services/r2-client.js";`
- Public URL helper: `buildPublicUrl(bucket, key)`

## 🔐 Environment
- All env values are stored in **Shiper** for safety.
- This service uses the global validator:  
  ```js
  import { validateEnv } from "../services/env-checker.js";
  validateEnv(); // hard stop if misconfigured
  ```

## 🧪 Example (pseudo)
```js
import { validateEnv } from "../services/env-checker.js";
import { validateR2Once, s3, R2_BUCKETS, uploadBuffer } from "../services/r2-client.js";

validateEnv();
await validateR2Once();

// your service logic here…
```

## 🛟 Notes
- OpenRouter fallback: not required; uses Gemini 2.5 TTS
