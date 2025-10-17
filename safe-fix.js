// safe-fix.js — Unified Shorthand Fix + Sanitizer (2025.10.11 Final)
import fs from "fs";
import path from "path";

const EXCLUDED_DIRS = ["node_modules", ".git", "dist", "build"];
let fixedFiles = 0;
let sanitizedFiles = 0;
let skipped = 0;

function shouldSkipDir(dir) {
  return EXCLUDED_DIRS.some(skip => dir.includes(skip));
}

function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, "utf8");

    // Skip template-literal-heavy files
    if (content.includes("`")) {
      skipped++;
      return;
    }

    let updated = content;

    // 🛠️ Expand simple shorthand { key } → { key: key }
    updated = updated.replace(/\{ *([a-zA-Z_][a-zA-Z0-9_]*) *\}/g, "{ $1: $1 }");

    // 🧽 Sanitize over-expanded duplicates { key: key: key } → { key: key }
    updated = updated
      .replace(/\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\1\s*:\s*\1\s*\}/g, "{ $1: $1 }")
      .replace(/:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\1/g, ": $1");

    if (updated !== content) {
      fs.writeFileSync(filePath, updated, "utf8");
      if (content.match(/\{ *([a-zA-Z_][a-zA-Z0-9_]*) *\}/)) fixedFiles++;
      else sanitizedFiles++;
      console.log(`🧩 Cleaned ${filePath}`);
    }
  } catch (err) {
    console.warn(`⚠️  Skipped ${filePath}: ${err.message}`);
  }
}

function walk(dir) {
  if (shouldSkipDir(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) walk(fullPath);
    else if (entry.endsWith(".js")) fixFile(fullPath);
  }
}

walk("./");

console.log(
  `✅ safe-fix complete → ${fixedFiles} shorthand expanded, ${sanitizedFiles} sanitized, ${skipped} skipped`
);
