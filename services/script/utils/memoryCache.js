import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import fs from 'fs';
import path from 'path';

const BASE_DIR = '/mnt/data/session_cache';

function getSessionFilePath(sessionId) {
  return path.join(BASE_DIR, `${sessionId}.json`);
}

// Ensure the base directory exists
if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

export function saveToMemory(sessionId, key, value) {
  const filePath = getSessionFilePath(sessionId);
  let sessionData = {};

  if (fs.existsSync(filePath)) {
    try {
      sessionData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      // Corrupted file or parse failure, start fresh
      sessionData = {};
    }
  }

  sessionData[key] = value;

  fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
}

export function getFromMemory(sessionId, key) {
  const filePath = getSessionFilePath(sessionId);
  if (!fs.existsSync(filePath)) return undefined;

  try {
    const sessionData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return sessionData[key];
  } catch {
    return undefined;
  }
}

export function clearMemory(sessionId) {
  const filePath = getSessionFilePath(sessionId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
