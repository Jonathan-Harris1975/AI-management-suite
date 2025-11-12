import pino from "pino";
import pinoHttp from "pino-http";

const level = process.env.LOG_LEVEL || "info";

export const log = pino({
  level,
  base: undefined,
  redact: { paths: ["req.headers.authorization", "req.headers.cookie"], remove: true },
  transport: process.env.NODE_ENV === "production" ? undefined : {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:standard" }
  }
});

export const httpLogger = pinoHttp({
  logger: log,
  customLogLevel: (res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  }
});
