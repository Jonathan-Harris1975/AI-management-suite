// service-logger.js — dedicated logger for this service

const debugEnabled = (process.env.LOG_LEVEL || "").toLowerCase() === "debug";

export const info = (event, data = {}) => baseInfo(event, data);
export const warn = (event, data = {}) => baseWarn(event, data);
export const error = (event, data = {}) => baseError(event, data);
export const debug = (event, data = {}) => { if (debugEnabled) baseDebug(event, data); };

export default { info, warn, error, debug };
