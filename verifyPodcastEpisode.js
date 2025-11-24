// verifyPodcastEpisode.js
// Usage: node verifyPodcastEpisode.js TT-2025-11-23

const sessionId = process.argv[2];

if (!sessionId) {
  console.error("Usage: node verifyPodcastEpisode.js <sessionId>");
  process.exit(1);
}

const META_BASE = process.env.R2_PUBLIC_BASE_URL_META;
if (!META_BASE) {
  console.error("R2_PUBLIC_BASE_URL_META not set");
  process.exit(1);
}

const metaUrl = `${META_BASE}/${sessionId}.json`;

async function head(url) {
  const res = await fetch(url, { method: "HEAD" });
  return { ok: res.ok, status: res.status };
}

(async () => {
  console.log("🔎 Verifying episode", sessionId);
  console.log("📘 Meta URL:", metaUrl);

  const metaRes = await fetch(metaUrl);
  if (!metaRes.ok) {
    console.error("❌ Meta fetch failed:", metaRes.status, metaRes.statusText);
    process.exit(1);
  }
  const meta = await metaRes.json();
  console.log("✅ Meta loaded. Title:", meta.title || "(none)");

  const urls = {
    podcastUrl: meta.podcastUrl,
    artUrl: meta.artUrl,
    transcriptUrl: meta.transcriptUrl,
  };

  for (const [label, url] of Object.entries(urls)) {
    if (!url) {
      console.warn(`⚠️ ${label} missing`);
      continue;
    }
    try {
      const res = await head(url);
      if (res.ok) {
        console.log(`✅ ${label} reachable (${res.status}) —`, url);
      } else {
        console.error(`❌ ${label} HEAD failed (${res.status}) —`, url);
      }
    } catch (err) {
      console.error(`❌ ${label} HEAD error:`, err.message);
    }
  }

  if (typeof meta.fileSize === "number") {
    console.log("📦 fileSize:", meta.fileSize, "bytes");
  }
  if (typeof meta.duration === "number") {
    console.log("⏱ duration:", meta.duration.toFixed(1), "seconds");
  }

  console.log("✅ Verification complete");
})().catch((err) => {
  console.error("❌ Verification error:", err);
  process.exit(1);
});
