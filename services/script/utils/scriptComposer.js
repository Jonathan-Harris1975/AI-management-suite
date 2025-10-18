import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/scriptComposer.js
import chunkText from './chunkText.js';
import editAndFormat from './editAndFormat.js';
import DurationCalculator from './durationCalculator.js';

async function composeScript(intro, chunks, outro, targetDuration = 60) {
  const fullScript = [intro, ...chunks, outro].join('\n\n');
  const cleaned = editAndFormat(fullScript);
  
  // Estimate total duration for logging
  const estimatedMinutes = DurationCalculator.textToMinutes(cleaned);
  console.log(`⏱️  Estimated total duration: ${estimatedMinutes.toFixed(1)} minutes`);
  
  // Adjust if significantly off target
  if (Math.abs(estimatedMinutes - targetDuration) > 10) {
    console.warn(`⚠️  Duration variance: ${Math.abs(estimatedMinutes - targetDuration).toFixed(1)} minutes from target`);
  }
  
  const chunked = chunkText(cleaned);
  return {
    script: chunked.join('\n\n'),
    estimatedDuration: estimatedMinutes,
    chunkCount: chunked.length
  };
}

export default composeScript;
