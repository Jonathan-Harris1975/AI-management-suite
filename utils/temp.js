import fs from "fs";
import path from "path";

export function sessionTempRoot(sessionId) {
  return path.resolve("/tmp/sessions", String(sessionId));
}
export function ensureSessionTemp(sessionId) {
  const dir = sessionTempRoot(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
export function cleanSessionTemp(sessionId) {
  const dir = sessionTempRoot(sessionId);
  if (!fs.existsSync(dir)) return { removed: 0 };
  let count = 0;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    try { fs.rmSync(p, { recursive: true, force: true }); count++; } catch {}
  }
  try { fs.rmdirSync(dir); } catch {}
  return { removed: count };
}
