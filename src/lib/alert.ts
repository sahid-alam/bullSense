/**
 * Operator paging (A0.1). One place for "something broke, tell the humans on Telegram."
 * Best-effort and self-contained: never throws, so a failing catch block can call it safely.
 */
import { operatorChatIds, storeAvailable } from "../providers/store.js";
import { sendTelegram } from "../providers/telegram.js";

export async function pageOperators(message: string): Promise<void> {
  try {
    if (!storeAvailable()) return;
    for (const chat of await operatorChatIds()) await sendTelegram(chat, message);
  } catch (e) {
    console.error("pageOperators failed (non-fatal):", e);
  }
}

/** Wrap a job's top-level catch: log, page, exit(1). */
export async function failJob(job: string, err: unknown): Promise<never> {
  console.error(`${job} failed:`, err);
  await pageOperators(`🚨 *${job}* failed: ${String(err).slice(0, 180)}`);
  process.exit(1);
}
