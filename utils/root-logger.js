// utils/root-logger.js
// ------------------------------------------------------------
// Root logger aligned with the RSS logger behaviour
// ------------------------------------------------------------
// - Delegates to the unified global logger (#logger.js)
// - No msg field
// - Flat structured logs
// - Minimal, tidy output
// - Emojis allowed directly in event strings
// ------------------------------------------------------------

import { info as baseInfo, warn as baseWarn, error as baseError } from "#logger.js";

class RootLogger {
  info(event, data = {}) {
    baseInfo(event, data);
  }

  warn(event, data = {}) {
    baseWarn(event, data);
  }

  error(event, data = {}) {
    baseError(event, data);
  }

  // semantic convenience wrappers (behave exactly the same)
  startup(event, data = {}) {
    baseInfo(event, data);
  }

  route(event, data = {}) {
    baseInfo(event, data);
  }

  script(event, data = {}) {
    baseInfo(event, data);
  }

  server(event, data = {}) {
    baseInfo(event, data);
  }
}

const log = new RootLogger();
export default log;
