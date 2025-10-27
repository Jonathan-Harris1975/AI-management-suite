import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/quotes.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const quotesPath = path.join(__dirname, 'quotes.txt');

const quotes = fs
  .readFileSync(quotesPath, 'utf-8')
  .split('\n')
  .filter((line) => line.trim());

export default function getRandomQuote() {
  const index = Math.floor(Math.random() * quotes.length);
  return quotes[index];
}
