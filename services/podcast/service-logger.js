
import {
  info as baseInfo,
  warn as baseWarn,
  error as baseError,
  debug as baseDebug
} from "#logger.js";

function emit(levelFn, event, data = {}) {
  // Correct signature: (event, data)
  levelFn(event, data);
}

class Logger {
  info(event, data = {}) {
    emit(baseInfo, event, data);
  }

  warn(event, data = {}) {
    emit(baseWarn, event, data);
  }

  error(event, data = {}) {
    emit(baseError, event, data);
  }

  debug(event, data = {}) {
    emit(baseDebug, event, data);
  }

  // Semantic wrappers
  startup(event, data = {}) { emit(baseInfo, event, data); }
  route(event, data = {}) { emit(baseInfo, event, data); }
  script(event, data = {}) { emit(baseInfo, event, data); }
  server(event, data = {}) { emit(baseInfo, event, data); }
}

const log = new Logger();
export default log;
