/**
 * Turning an AI stream into a response body.
 *
 * This exists as its own file for one reason: the promise it makes — that the
 * body always closes — is the whole fix for a chat that hangs, and a promise
 * like that is worth a test. Inline in the route it was untestable, and it was
 * also wrong: the database writes sat between the last token and the close, so
 * one slow query held the browser open long after the answer had arrived.
 */

import { ERROR_MARKER } from "./stream-client";
export { ERROR_MARKER };

export type ChatStreamParts = {
  /** Text as the provider sends it. May throw part-way through. */
  chunks: AsyncIterable<string>;
  /**
   * One non-streaming attempt, used only when streaming produced nothing. This
   * is what rescues a model that spent its entire output budget thinking.
   */
  retry: () => Promise<string>;
  /** Give the allowance back. Only called when the user got nothing. */
  refund: () => Promise<unknown>;
  /** Store the answer. Runs after the browser already has it. */
  save: (answer: string) => Promise<unknown>;
  /** Stop pulling from the provider. Called when the browser goes away. */
  abort: () => void;
  /** Somewhere to report a failure that the user never sees. */
  onError?: (err: unknown, stage: "stream" | "retry" | "save") => void;
};

/**
 * The response body.
 *
 * Order matters and is the point: stream, then rescue, then close, then write.
 * Nothing after the close can delay the browser, and the close happens whatever
 * went wrong above it.
 */
export function chatStream(parts: ChatStreamParts): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const report = parts.onError ?? (() => {});

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = "";
      // A closed or cancelled stream makes enqueue throw; that is not a failure,
      // it just means the reader left.
      const push = (t: string) => { try { controller.enqueue(encoder.encode(t)); } catch { /* reader gone */ } };

      try {
        try {
          for await (const t of parts.chunks) { answer += t; push(t); }
        } catch (err) {
          // Keep whatever arrived: half an explanation beats an error message.
          report(err, "stream");
        }

        if (!answer.trim()) {
          try {
            answer = (await parts.retry()).trim();
            if (answer) push(answer);
          } catch (err) {
            report(err, "retry");
          }
        }

        if (!answer.trim()) push(ERROR_MARKER);
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }

      // Past this line the browser is already done waiting.
      try {
        if (answer.trim()) await parts.save(answer);
        else await parts.refund();
      } catch (err) {
        report(err, "save");
      }
    },

    cancel() { parts.abort(); },
  });
}
