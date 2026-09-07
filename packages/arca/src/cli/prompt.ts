import { createInterface } from "node:readline/promises";
import type { CliIo } from "./output";

/**
 * True when the CLI may ask a question. Without a TTY on stdin every missing
 * value has to arrive as a flag, so scripts and CI fail fast instead of hanging.
 */
export function isInteractive(io: CliIo): boolean {
  return io.stdin.isTTY === true;
}

/** Asks one question and returns the trimmed answer. Only call on a TTY. */
export async function ask(io: CliIo, question: string): Promise<string> {
  const rl = createInterface({
    input: io.stdin,
    output: io.stdout as NodeJS.WritableStream,
  });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

/** Asks until the answer passes, or gives up after a few tries. */
export async function askUntil(
  io: CliIo,
  question: string,
  isValid: (answer: string) => boolean,
  attempts = 3
): Promise<string | undefined> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const answer = await ask(io, question);
    if (isValid(answer)) {
      return answer;
    }
  }
  return undefined;
}
