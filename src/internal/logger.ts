import type { ArcaLogLevel, ArcaLoggerConfig } from "./types";

const ARCA_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type ArcaLogger = {
  disabled: boolean;
  level: ArcaLogLevel;
  log: (level: ArcaLogLevel, message: string, ...args: unknown[]) => void;
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
};

export function createArcaLogger(config?: ArcaLoggerConfig): ArcaLogger {
  const disabled = config?.disabled ?? false;
  const level = resolveArcaLogLevel(config?.level);
  const sink = config?.log ?? defaultArcaLog;

  const log = (messageLevel: ArcaLogLevel, message: string, ...args: unknown[]) => {
    if (disabled || !shouldLog(level, messageLevel)) {
      return;
    }

    sink(messageLevel, message, ...args);
  };

  return {
    disabled,
    level,
    log,
    debug(message, ...args) {
      log("debug", message, ...args);
    },
    info(message, ...args) {
      log("info", message, ...args);
    },
    warn(message, ...args) {
      log("warn", message, ...args);
    },
    error(message, ...args) {
      log("error", message, ...args);
    },
  };
}

export function resolveArcaLogLevel(level?: string): ArcaLogLevel {
  if (isArcaLogLevel(level)) {
    return level;
  }

  const envLevel = process.env.ARCA_LOG_LEVEL?.trim().toLowerCase();
  if (isArcaLogLevel(envLevel)) {
    return envLevel;
  }

  return "warn";
}

function shouldLog(
  threshold: ArcaLogLevel,
  messageLevel: ArcaLogLevel
): boolean {
  return (
    ARCA_LOG_LEVELS.indexOf(messageLevel) >= ARCA_LOG_LEVELS.indexOf(threshold)
  );
}

function isArcaLogLevel(value: string | undefined): value is ArcaLogLevel {
  return ARCA_LOG_LEVELS.includes(value as ArcaLogLevel);
}

function defaultArcaLog(
  level: ArcaLogLevel,
  message: string,
  ...args: unknown[]
): void {
  const method =
    level === "debug"
      ? console.debug
      : level === "info"
        ? console.info
        : level === "warn"
          ? console.warn
          : console.error;
  method(message, ...args);
}
