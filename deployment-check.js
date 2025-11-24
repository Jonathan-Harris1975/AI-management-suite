import { execSync } from "child_process";

function check(cmd) {
  try {
    execSync(cmd, { stdio: "ignore" });
    console.log(`✅ ${cmd} OK`);
  } catch (err) {
    console.error(`❌ ${cmd} failed:`, err.message);
    process.exitCode = 1;
  }
}

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error("❌ Missing env vars:", missing.join(", "));
    process.exitCode = 1;
  } else {
    console.log("✅ Required env vars present");
  }
}

console.log("🔎 Running deployment-check...");
check("node -v");
check("ffmpeg -version");
check("ffprobe -version");

requireEnv([
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_PODCAST",
  "R2_BUCKET_META",
  "R2_PUBLIC_BASE_URL_PODCAST",
  "R2_PUBLIC_BASE_URL_META",
]);

if (process.exitCode) {
  console.error("⚠️ Deployment check FAILED");
} else {
  console.log("🎉 Deployment check PASSED");
}
