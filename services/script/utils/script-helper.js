import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/script-helper.js
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

/**
 * Store step metadata and optionally trigger the next Hookdeck webhook.
 *
 * @param {Object} options
 * @param {string} options.sessionId - Unique session identifier
 * @param {string} options.step - Current step name (intro, main, outro, compose)
 * @param {Object} [options.payload={}] - Any metadata to store for this step
 * @param {string} [options.nextUrl] - Next Hookdeck webhook URL
 */
export async function storeAndTrigger({ sessionId, step, payload = {}, nextUrl }) {
  const storageDir = path.resolve('/mnt/data', sessionId);
  fs.mkdirSync(storageDir, { recursive: true });

  const metaPath = path.join(storageDir, 'script-meta.json');
  let meta = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch {
      meta = {};
    }
  }

  // Update metadata with this step info
  meta[step] = { ...payload, completedAt: new Date().toISOString() };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  // Trigger next Hookdeck webhook if provided
  if (nextUrl) {
    try {
      await fetch(nextUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...payload })
      });
      console.log(`✅ Step "${step}" complete. Triggered next webhook: ${nextUrl}`);
    } catch (err) {
      console.error(`❌ Failed to trigger next webhook after "${step}":`, err);
    }
  }
}
