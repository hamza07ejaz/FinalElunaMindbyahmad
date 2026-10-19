import { toFile } from "openai";
import { audioProvider, complete, reportFailed, reportOk } from "./ai";

/**
 * Speech to text.
 *
 * Providers differ here more than anywhere else in the app, so there are two
 * paths and the first one that works wins:
 *
 *   1. /audio/transcriptions (OpenAI Whisper and anything that copies it).
 *   2. chat completions with an inline audio part, which is how Gemini and a
 *      few other OpenAI-compatible providers accept audio.
 *
 * The model for path 1 comes from the provider's own "transcribe model" field
 * in the admin panel, falling back to OPENAI_TRANSCRIBE_MODEL.
 */

export const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";

/** Hosting matters more than the provider: a long file will outlive the request window. */
export const TRANSCRIBE_MAX_BYTES = Number(process.env.TRANSCRIBE_MAX_BYTES || 12 * 1024 * 1024);

const AUDIO_FORMATS = ["mp3", "wav", "m4a", "webm", "ogg", "flac", "mp4", "mpga", "aac"] as const;

/** The format name the chat-completions path expects, derived from name then mime. */
export function audioFormat(fileName: string, mime: string): string {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if ((AUDIO_FORMATS as readonly string[]).includes(ext)) return ext === "mpga" ? "mp3" : ext;
  const fromMime = mime.split("/")[1]?.split(";")[0]?.toLowerCase() ?? "";
  if (fromMime.includes("mpeg")) return "mp3";
  if (fromMime.includes("x-m4a") || fromMime.includes("mp4")) return "m4a";
  if ((AUDIO_FORMATS as readonly string[]).includes(fromMime)) return fromMime;
  return "mp3";
}

export class TranscribeError extends Error {
  constructor(message: string, readonly kind: "unsupported" | "failed" = "failed") {
    super(message);
  }
}

async function viaTranscriptionsApi(bytes: Uint8Array, fileName: string, mime: string, language?: string) {
  const { client, model, provider } = await audioProvider();
  const file = await toFile(bytes, fileName || "audio.mp3", { type: mime || "audio/mpeg" });
  try {
    const res = await client.audio.transcriptions.create({
      file,
      model,
      // "auto" means let the model decide, which is what omitting the field does.
      ...(language && language !== "auto" ? { language } : {}),
      response_format: "text",
    });
    void reportOk(provider);
    // response_format "text" returns a bare string; some providers still wrap it.
    return typeof res === "string" ? res : ((res as { text?: string }).text ?? "");
  } catch (err) {
    // Recorded, but not fatal: the chat fallback below may still manage it,
    // which is the normal case on providers with no transcription endpoint.
    void reportFailed(provider, err);
    throw err;
  }
}

async function viaChatCompletions(bytes: Uint8Array, fileName: string, mime: string, language?: string) {
  const format = audioFormat(fileName, mime);
  const instruction = language && language !== "auto"
    ? `Transcribe this recording word for word in ${language}. Output only the transcription.`
    : "Transcribe this recording word for word in the language it is spoken in. Output only the transcription, no commentary.";

  const res = await complete({
    model: process.env.OPENAI_AUDIO_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    max_tokens: 8000,
    temperature: 0,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: instruction },
        // Cast: this content part is in the OpenAI audio spec but not in every
        // version of the typings, and providers accept it as sent.
        { type: "input_audio", input_audio: { data: Buffer.from(bytes).toString("base64"), format } },
      ] as never,
    }],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

/** Transcribe a recording, trying the dedicated endpoint before the chat fallback. */
export async function transcribeAudio(
  bytes: Uint8Array, fileName: string, mime: string, language?: string
): Promise<{ text: string; via: "transcriptions" | "chat" }> {
  if (bytes.byteLength > TRANSCRIBE_MAX_BYTES)
    throw new TranscribeError(
      `That recording is ${(bytes.byteLength / 1048576).toFixed(1)} MB. Transcription works up to ${Math.round(TRANSCRIBE_MAX_BYTES / 1048576)} MB — split it into shorter parts.`,
      "unsupported"
    );

  let firstError: unknown = null;
  try {
    const text = await viaTranscriptionsApi(bytes, fileName, mime, language);
    if (text.trim()) return { text: text.trim(), via: "transcriptions" };
    firstError = new Error("empty transcription");
  } catch (err) {
    firstError = err;
    console.error("transcription endpoint failed, trying chat fallback:", (err as Error)?.message);
  }

  try {
    const text = await viaChatCompletions(bytes, fileName, mime, language);
    if (text.trim()) return { text: text.trim(), via: "chat" };
  } catch (err) {
    console.error("chat audio fallback failed:", (err as Error)?.message);
  }

  console.error("transcription unavailable:", firstError);
  throw new TranscribeError(
    "This recording could not be transcribed. Your AI provider may not support audio — check OPENAI_TRANSCRIBE_MODEL, or try a clearer MP3.",
    "failed"
  );
}

/** Turn a raw transcript into something a student can revise from. */
export function notesPrompt(fileName: string) {
  return `You are turning a lecture recording into study material. The transcript below came from "${fileName}" and may contain filler words, false starts and mis-heard words.

Write, in markdown:
## Summary
Three or four sentences on what the recording covered.
## Key points
The main ideas as bullets, in the order they were taught, with any numbers, dates, names and definitions kept exactly.
## Formulas and terms
Any formula in LaTeX ($inline$ or $$display$$) and any term with a one-line definition. Skip this section if there were none.
## Action items
Anything the speaker told students to do, read or prepare. Skip this section if there were none.
## Check yourself
Three questions a student should be able to answer after this recording.

Do not invent anything that is not in the transcript. Where the transcript is unclear, say so rather than guessing.`;
}
