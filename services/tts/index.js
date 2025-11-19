// ============================================================
// 🧠 TTS Orchestration — Public Entry Point
// ============================================================
//
// This module simply re-exports orchestrateTTS from the internal
// orchestrator implementation. All heavy lifting lives in:
//   ./utils/orchestrator.js
// ============================================================

import orchestrateTTS, { orchestrateTTS as namedOrchestrateTTS } from "./utils/orchestrator.js";

export { namedOrchestrateTTS as orchestrateTTS };
export default orchestrateTTS;
