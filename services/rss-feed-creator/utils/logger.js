import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import winston from "winston";

const timestamp = winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" });
const logFormat = winston.format.printf(({ level, message, timestamp }) => {
  const colorizer = levelColors[level] || ((txt) => txt);
  return `${(timestamp)} ${colorizer(level.toUpperCase())} ${message}`;
});

export const log = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(timestamp, logFormat),
  transports: [new winston.transports.Console({ handleExceptions: true })],
  exitOnError: false,
});

export const info = (msg) => log.info(msg);
export const warn = (msg) => log.warn(msg);
export const error = (msg) => log.error(msg);
export const debug = (msg) => log.debug(msg);

log.info("🧠 Logger initialized and colorized output enabled.");
