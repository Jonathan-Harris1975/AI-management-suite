import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import fs from 'fs';
import path from 'path';

let quotesCache = null;

export default function getTuringQuote() {
  if (!quotesCache) {
    const quotesPath = path.resolve('utils', 'quotes.txt');
    const raw = fs.readFileSync(quotesPath, 'utf-8');
    quotesCache = raw
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  const i = Math.floor(Math.random() * quotesCache.length);
  return quotesCache[i];
}
