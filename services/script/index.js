// services/script/index.js

import orchestrateScript, { orchestrateScript as _namedOrchestrateScript } from "./utils/orchestrator.js";

// Keep the current API
export { _namedOrchestrateScript as orchestrateScript };

// Backward-compatible shim for older pipelines
export async function orchestrateEpisode(sessionId) {
  return orchestrateScript(sessionId);
}

// Default export maintained for convenience
export default orchestrateScript;
