# Artwork Service

Generates the cover art and metadata for each episode.

## 🧩 Role
Create static image assets and store meta for the episode.

## 🔗 Inputs → Outputs
- **Reads**: `raw-text` or orchestrator payload (episode title/summary)
- **Writes**: `podcast-meta` bucket

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
- OpenRouter fallback: not required
