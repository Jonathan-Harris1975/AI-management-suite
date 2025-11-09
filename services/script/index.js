// services/script/index.js

import orchestrateScriptDefault from "./utils/orchestrator.js";

// Create named alias for backward compatibility
export const orchestrateScript = orchestrateScriptDefault;

// Backward-compatible shim for older pipelines (uses orchestrateEpisode name)
export async function orchestrateEpisode(sessionId) {
  return orchestrateScriptDefault(sessionId);
}

// Default export maintained for convenience
export default orchestrateScriptDefault;
