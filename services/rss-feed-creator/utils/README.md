# RSS Feed Creator (Standalone)

Produces a daily RSS feed for the newsletter and as input to the script service.

## 🧩 Role
Fetches sources, summarises, and writes structured feed items.

## 🔗 Inputs → Outputs
- **Reads**: external sources (news APIs/RSS), configuration
- **Writes**: `rss-feeds` bucket (Cloudflare R2)

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
- OpenRouter fallback: enabled here to maintain feed generation during model outages
