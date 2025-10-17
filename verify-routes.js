// verify-routes.js — Deep Scanner + Fixer for malformed shorthand or colons
import fs from "fs";
import path from "path";

const TARGET_DIRS = ["routes", "services"];
const EXCLUDED_DIRS = ["node_modules", ".git", "dist", "build"];
let fixedCount = 0;

function shouldSkip(dir) {
  return EXCLUDED_DIRS.some(skip => dir.includes(skip));
}

function deepFix(content) {
  let updated = content;

  // 🧩 fix malformed `{ key: key: key }` or `{ key: key: key: key }`
  updated = updated.replace(
    /\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(\1\s*:\s*)+\1\s*\}/g,
    "{ $1: $1 }"
  );

  // 🧩 fix malformed inline key/values `: key: key`
  updated = updated.replace(/:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\1/g, ": $1");

  // 🧩 fix simple shorthand `{ key } → { key: key }`
  updated = updated.replace(/\{ *([a-zA-Z_][a-zA-Z0-9_]*) *\}/g, "{ $1: $1 }");

  return updated;
}

function scanDir(dir) {
  if (shouldSkip(dir)) return;

  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) scanDir(full);
    else if (entry.endsWith(".js")) {
      let data = fs.readFileSync(full, "utf8");
      const fixed = deepFix(data);
      if (fixed !== data) {
        fs.writeFileSync(full, fixed, "utf8");
        console.log(`🧩 Fixed ${full}`);
        fixedCount++;
      }
    }
  }
}

for (const d of TARGET_DIRS) {
  if (fs.existsSync(d)) scanDir(d);
}

console.log(`✅ verify-routes complete – ${fixedCount} files fixed`);
