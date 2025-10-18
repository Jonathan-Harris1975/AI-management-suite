export function validateEnv() {
  const required = [
    "R2_ENDPOINT",
    "R2_REGION",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ];

  const missing = required.filter(v => !process.env[v]);
  if (missing.length) {
    console.warn(`⚠️ Missing env vars: ${missing.join(", ")}`);
  } else {
    console.log("✅ Env check passed");
  }
}
