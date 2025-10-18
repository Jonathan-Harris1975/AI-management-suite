import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import fs from 'fs';
import path from 'path';

/**
 * Loads a text file (like intro.txt or outro.txt) from the session's storage folder.
 * 
 * @param {string} sessionId - Unique session ID
 * @param {string} key - Either 'intro', 'outro', etc.
 * @returns {string|null} - File contents or null if not found
 */
export default function loadFromStorage(sessionId, key) {
  try {
    const filePath = path.resolve('/mnt/data', sessionId, `${key}.txt`);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
    return null;
  } catch (err) {
    console.error(`❌ Failed to load ${key} from storage for session ${sessionId}:`, err);
    return null;
  }
}
