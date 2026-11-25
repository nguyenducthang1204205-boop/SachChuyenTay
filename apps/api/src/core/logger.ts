import { pino, type DestinationStream, type Logger } from "pino";
import type { AppConfig } from "../config/env.js";

export type { Logger };

export interface LoggerOptions {
  /**
   * Ghi log qua `console` thay vì stdout — dùng trên Cloudflare Workers (không có stdout thật);
   * Workers Logs tự tách các trường của object JSON.
   */
  console?: boolean;
}

const LEVEL_NAMES: Record<number, string> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal"
};

/* eslint-disable no-console */
const consoleDestination: DestinationStream = {
  write(line: string) {
    try {
      const entry = JSON.parse(line) as { level?: number };
      const level = entry.level ?? 30;
      const out = { ...entry, level: LEVEL_NAMES[level] ?? level };
      if (level >= 50) console.error(out);
      else if (level >= 40) console.warn(out);
      else console.log(out);
    } catch {
      console.log(line);
    }
  }
};
/* eslint-enable no-console */

/** Logger có cấu trúc (JSON) — production đẩy thẳng vào hệ thống log; dev in đẹp bằng pino-pretty. */
export function createLogger(config: Pick<AppConfig, "LOG_LEVEL" | "NODE_ENV">, options: LoggerOptions = {}): Logger {
  const pretty = config.NODE_ENV === "development" && !options.console;
  const logOptions = {
    level: config.NODE_ENV === "test" ? "silent" : config.LOG_LEVEL,
    base: { service: "sct-api" },
    redact: {
      // Không bao giờ ghi thông tin cá nhân của khách vào log
      paths: ["req.headers.authorization", "req.headers.cookie", "*.phone", "*.email", "*.address"],
      censor: "[redacted]"
    },
    ...(pretty && {
      transport: {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname,service" }
      }
    })
  };
  return options.console ? pino(logOptions, consoleDestination) : pino(logOptions);
}
