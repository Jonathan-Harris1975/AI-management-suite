// services/script/index.js
// Unified export layer to expose orchestrateScript to other services

import { orchestrateEpisode as orchestrateScript } from "./utils/orchestrator.js";
import * as models from "./utils/models.js";

export {
  orchestrateScript,
  models
};

export default {
  orchestrateScript,
  models
};
