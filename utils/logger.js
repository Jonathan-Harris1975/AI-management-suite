// /utils/logger.js
export const log = {
  info: (msg, meta) => process.stdout.write(JSON.stringify({ level: "info", time: new Date().toISOString(), message: msg, ...(meta?{meta}: {}) }) + "\n"),
  error: (msg, meta) => process.stdout.write(JSON.stringify({ level: "error", time: new Date().toISOString(), message: msg, ...(meta?{meta}: {}) }) + "\n"),
  debug: (msg, meta) => process.stdout.write(JSON.stringify({ level: "debug", time: new Date().toISOString(), message: msg, ...(meta?{meta}: {}) }) + "\n"),
};
