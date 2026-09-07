import type { ArcaClient } from "../client";
import type { ArcaClientConfig, ArcaClientOptions } from "../internal/types";
import type { WsaaAuthModule } from "../wsaa";

/** Minimal writable surface the CLI needs. Tests pass a string collector. */
export type CliOutputStream = {
  write(chunk: string): void;
  isTTY?: boolean;
};

/** Minimal readable surface the CLI needs for interactive prompts. */
export type CliInputStream = NodeJS.ReadableStream & { isTTY?: boolean };

/** Everything the CLI touches outside itself. Injected so tests stay offline. */
export type CliIo = {
  stdout: CliOutputStream;
  stderr: CliOutputStream;
  stdin: CliInputStream;
  env: Record<string, string | undefined>;
  cwd: string;
  /** Where the WSAA ticket is cached between runs. Never holds anything else. */
  cacheDir: string;
  now(): Date;
  createClient(options: ArcaClientOptions): ArcaClient;
  createAuth(config: ArcaClientConfig): WsaaAuthModule;
};

/** 0 all good, 1 something ARCA-side is wrong, 2 the command was wrong. */
export const CLI_EXIT = {
  ok: 0,
  failed: 1,
  usage: 2,
} as const;

const GREEN = "\u001B[32m";
const RED = "\u001B[31m";
const YELLOW = "\u001B[33m";
const RESET = "\u001B[0m";

/** Column where a layer detail starts, so the marks line up like a shell. */
const LABEL_WIDTH = 22;
const INDENT = "  ";

/** One line per fact. Colors land on the mark and nowhere else. */
export type CliWriter = {
  ok(label: string, detail?: string): void;
  fail(label: string, detail?: string): void;
  warn(label: string, detail?: string): void;
  /** An indented continuation line: a diagnosis, a fix or one sales point. */
  note(text: string): void;
  line(text: string): void;
  blank(): void;
  json(value: unknown): void;
};

/**
 * ANSI is on only for a TTY without `NO_COLOR` and without `--no-color`.
 * Any of the three turns it off.
 */
export function shouldUseColor(
  stream: CliOutputStream,
  env: Record<string, string | undefined>,
  noColorFlag = false
): boolean {
  if (noColorFlag || env.NO_COLOR !== undefined) {
    return false;
  }
  return stream.isTTY === true;
}

export function createWriter(
  stream: CliOutputStream,
  options: { color: boolean }
): CliWriter {
  const paint = (color: string, text: string) =>
    options.color ? `${color}${text}${RESET}` : text;

  const mark = (symbol: string, label: string, detail?: string) => {
    const body =
      detail === undefined ? label : `${label.padEnd(LABEL_WIDTH)} ${detail}`;
    stream.write(`${symbol} ${body}\n`);
  };

  return {
    ok(label, detail) {
      mark(paint(GREEN, "✓"), label, detail);
    },
    fail(label, detail) {
      mark(paint(RED, "✗"), label, detail);
    },
    warn(label, detail) {
      mark(paint(YELLOW, "!"), label, detail);
    },
    note(text) {
      stream.write(`${INDENT}${text}\n`);
    },
    line(text) {
      stream.write(`${text}\n`);
    },
    blank() {
      stream.write("\n");
    },
    json(value) {
      stream.write(`${JSON.stringify(value, null, 2)}\n`);
    },
  };
}
