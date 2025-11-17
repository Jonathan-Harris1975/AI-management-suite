import log from ;
// ============================================================
// 🧠 AI Podcast Suite — Bootstrap Sequence
// ============================================================
// Ensures all RSS feed data and R2 text assets are initialized
// before the web server starts.
// ============================================================

import { execSync } from ;
import { log,info} from ;

async function run(cmd, label) {
  try {
    info(`🚀 Running ${label}...`);
    execSync(cmd, { stdio:  });
    info(`✅ ${label} completed successfully.`);
  } catch (err) {
    log.error(`❌ ${label} failed: ${err.message}`);
  }
}

(async () => {
  info();
  info();

  // 1️⃣ Load and validate environment variables
  await run(, );

  // 2️⃣ Initialize RSS feed data into R2 (critical)
  await run(, );

  // 3️⃣ Perform runtime sanity checks
  await run(, );

  // 4️⃣ Validate temp storage + Cloudflare R2 connectivity
  await run(, );

  // 5️⃣ Launch the main web server
  await run(, );

  info();
  info( );
})();
