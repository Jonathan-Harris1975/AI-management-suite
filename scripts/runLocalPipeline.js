
// Run the podcast pipeline locally
import { runPodcastPipeline } from "../services/podcast/runPodcastPipeline.js";

const sessionId = process.argv[2] || `session-${Date.now()}`;
const res = await runPodcastPipeline(sessionId);
console.log(JSON.stringify(res, null, 2));
