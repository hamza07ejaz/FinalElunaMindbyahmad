import OpenAI from "openai";
import { supabaseAdmin } from "./supabase/admin";

/**
 * The AI layer.
 *
 * Keys come from the admin panel (the `ai_providers` table) and fall back to
 * the environment variables, so the app still works before anything is set up
 * and still works if the database is briefly unreachable.
 *
 * Two things this buys that a single env var cannot:
 *   - changing a key, a model or a provider takes a save, not a redeploy;
 *   - more than one key can be listed, and a dead or rate-limited one fails
 *     over to the next instead of taking every AI feature down.
 *
 * Keys never leave the server. The admin API returns a masked preview only.
 */

export type Provider = {
  id: string | null;          // null = the one built from environment variables
  label: string;
  apiKey: string;
  baseUrl: string;            // "" = OpenAI itself
  model: string;
  transcribeModel: string;
};

const CACHE_MS = 30_000;
let cache: { at: number; value: Provider[] } | null = null;

/* ------------------------------------------------------------------ */
/* Deadlines                                                           */
/* ------------------------------------------------------------------ */

/**
 * Nothing here is allowed to wait forever.
 *
 * The hosting platform cuts a function off at 60 seconds, so every number below
 * has to leave room to give up, say so, and still answer the browser. Without
 * these the SDK's own default is ten minutes — long past the point where the
 * platform has killed the request and the user is staring at a spinner.
 */
const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** One whole HTTP request to a provider. */
export const REQUEST_MS = num(process.env.AI_REQUEST_MS, 45_000);
/** How long a stream may stay silent before the first token arrives. */
export const FIRST_TOKEN_MS = num(process.env.AI_FIRST_TOKEN_MS, 20_000);
/** How long a stream may stay silent *between* tokens. */
export const IDLE_MS = num(process.env.AI_IDLE_MS, 20_000);
/** The whole streaming attempt, failovers included. */
export const TOTAL_MS = num(process.env.AI_TOTAL_MS, 50_000);

class StallError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} after ${Math.round(ms / 1000)}s`);
  }
}

class EmptyStreamError extends Error {
  constructor(label: string) {
    super(`"${label}" closed the stream without sending any text`);
  }
}

/** The environment-variable provider, used when nothing is configured in the panel. */
function envProvider(): Provider | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    id: null,
    label: "Environment variables",
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL?.trim() || "",
    model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "whisper-1",
  };
}

/** Enabled providers, best first. The env one is appended as a last resort. */
export async function loadProviders(force = false): Promise<Provider[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const list: Provider[] = [];
  try {
    const { data, error } = await supabaseAdmin()
      .from("ai_providers")
      .select("id,label,api_key,base_url,model,transcribe_model,priority,created_at")
      .eq("enabled", true)
      .order("priority").order("created_at");
    if (error) throw new Error(error.message);

    for (const r of data ?? []) {
      if (!r.api_key?.trim()) continue;
      list.push({
        id: r.id as string,
        label: (r.label as string) || "Unnamed",
        apiKey: (r.api_key as string).trim(),
        baseUrl: ((r.base_url as string) || "").trim(),
        model: ((r.model as string) || "gpt-4o-mini").trim(),
        transcribeModel: ((r.transcribe_model as string) || "").trim(),
      });
    }
  } catch (err) {
    // Migration 010 may not have been run, or the database may be down. Either
    // way the environment variables still have to be able to carry the app.
    console.error("ai providers unavailable, using environment:", (err as Error)?.message);
  }

  const env = envProvider();
  if (env && !list.some((p) => p.apiKey === env.apiKey && p.baseUrl === env.baseUrl)) list.push(env);

  cache = { at: Date.now(), value: list };
  return list;
}

export function clearProviderCache() { cache = null; }

/** A client for one provider. Not cached: a key can change under us at any save. */
export function clientFor(p: Provider): OpenAI {
  const client = new OpenAI({
    apiKey: p.apiKey,
    baseURL: p.baseUrl || undefined,
    // Without this the SDK waits ten minutes, which is longer than the platform
    // allows the function to live: the user would see a spinner and never an error.
    timeout: REQUEST_MS,
    // No SDK-level retries. The default two would stack another two timeouts on
    // top of this one — three times 45 seconds against a 60-second ceiling — and
    // failing over to the next key is a better answer to a dead provider anyway.
    maxRetries: Number(process.env.AI_MAX_RETRIES ?? 0),
  });
  if (p.baseUrl) patchForCompat(client, p.baseUrl);
  return client;
}

/* ------------------------------------------------------------------ */
/* Health                                                              */
/* ------------------------------------------------------------------ */

async function markOk(p: Provider) {
  if (!p.id) return;
  try { await supabaseAdmin().rpc("ai_provider_ok", { p_id: p.id }); } catch { /* bookkeeping */ }
}

async function markFailed(p: Provider, err: unknown) {
  if (!p.id) return;
  const message = (err as { message?: string })?.message ?? String(err);
  try { await supabaseAdmin().rpc("ai_provider_failed", { p_id: p.id, p_error: message }); } catch { /* bookkeeping */ }
}

/**
 * Is it worth trying the next key?
 *
 * A bad request is our fault and will fail identically everywhere, so failing
 * over would just burn a second key for the same error. Auth, quota, rate limit
 * and server trouble are the provider's problem, and the next key may well work.
 */
function worthRetrying(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (typeof status === "number") return status === 401 || status === 403 || status === 429 || status >= 500;
  return true;   // a network error has no status, and is exactly the retry case
}

export class NoProviderError extends Error {
  constructor() {
    super("No AI provider is configured. Add a key in the admin panel under AI keys, or set OPENAI_API_KEY.");
  }
}

/* ------------------------------------------------------------------ */
/* The calls                                                           */
/* ------------------------------------------------------------------ */

type CompletionParams = Record<string, unknown>;

/**
 * A chat completion, through the first provider that answers.
 *
 * The caller's `model` is ignored: the model belongs to whichever key ends up
 * being used, so a failover to a different provider still asks for a model that
 * provider actually has.
 */
export async function complete(params: CompletionParams): Promise<any> {
  const providers = await loadProviders();
  if (!providers.length) throw new NoProviderError();

  let lastError: unknown = null;

  for (const p of providers) {
    try {
      const client = clientFor(p);
      const res = await (client.chat.completions.create as any)({ ...params, model: p.model });

      // An answer with nothing in it is a failure, not a success. It happens on
      // a model that spent its whole output budget thinking, and on a provider
      // that silently refused. Either way the next key deserves a turn, and the
      // provider's health should show it.
      if (!params.stream && !(res?.choices?.[0]?.message?.content ?? "").trim()) {
        throw new EmptyStreamError(p.label);
      }

      void markOk(p);
      return res;
    } catch (err) {
      lastError = err;
      console.error(`AI provider "${p.label}" failed:`, (err as Error)?.message);
      void markFailed(p, err);
      if (!worthRetrying(err)) break;
    }
  }

  throw lastError ?? new NoProviderError();
}

/* ------------------------------------------------------------------ */
/* Streaming                                                           */
/* ------------------------------------------------------------------ */

export type StreamHandle = {
  provider: Provider;
  /** Text as it arrives. Throws if the provider dies part-way through. */
  chunks: AsyncIterable<string>;
  /** Stop pulling and hang up on the provider — called when the user cancels. */
  abort(): void;
};

/** The text in one streamed chunk, whatever shape the provider sends it in. */
function textOf(chunk: any): string {
  const delta = chunk?.choices?.[0]?.delta;
  const c = delta?.content;
  if (typeof c === "string") return c;
  // A few providers send the content parts as an array instead of a string.
  if (Array.isArray(c)) return c.map((part: any) => (typeof part === "string" ? part : part?.text ?? "")).join("");
  // Reasoning tokens are deliberately ignored: they are the model thinking out
  // loud, not the answer, and showing them reads as the model losing the plot.
  return "";
}

/** `it.next()`, but it gives up instead of waiting forever. */
async function nextWithin<T>(it: AsyncIterator<T>, ms: number, what: string): Promise<IteratorResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      it.next(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new StallError(what, ms)), ms); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Yield the rest of a stream, abandoning it if it goes quiet or runs long. */
async function* drain(it: AsyncIterator<any>, first: string, stream: any, deadline: number): AsyncGenerator<string> {
  try {
    // Inside the try, not before it: a reader that walks away while the very
    // first token is being handed over must still hang up on the provider.
    if (first) yield first;
    for (;;) {
      // Out of time: stop cleanly with whatever has been said, rather than
      // letting the platform kill the function mid-sentence.
      if (Date.now() > deadline) return;
      const r = await nextWithin(it, IDLE_MS, "the AI went quiet");
      if (r.done) return;
      const t = textOf(r.value);
      if (t) yield t;
    }
  } finally {
    try { stream?.controller?.abort?.(); } catch { /* already closed */ }
  }
}

/**
 * A streaming chat completion, through the first provider that actually speaks.
 *
 * The difference from `complete({ stream: true })` is where "success" is judged.
 * Creating a stream only means the provider accepted the request; a key with no
 * quota, a wrong model name or a provider having a bad day can all open a stream
 * and then say nothing. So this waits for a real token before it commits, which
 * is what makes failover work for streaming at all.
 */
export async function streamComplete(params: CompletionParams): Promise<StreamHandle> {
  const providers = await loadProviders();
  if (!providers.length) throw new NoProviderError();

  const deadline = Date.now() + TOTAL_MS;
  let lastError: unknown = null;

  for (const p of providers) {
    let stream: any = null;
    try {
      const client = clientFor(p);
      stream = await (client.chat.completions.create as any)({ ...params, model: p.model, stream: true });
      const it: AsyncIterator<any> = stream[Symbol.asyncIterator]();

      // Pull until there is text. Leading chunks carry the role and nothing else.
      let first = "";
      for (;;) {
        const r = await nextWithin(it, FIRST_TOKEN_MS, `"${p.label}" sent nothing`);
        if (r.done) throw new EmptyStreamError(p.label);
        first = textOf(r.value);
        if (first) break;
      }

      void markOk(p);
      return {
        provider: p,
        chunks: drain(it, first, stream, deadline),
        abort: () => { try { stream?.controller?.abort?.(); } catch { /* already closed */ } },
      };
    } catch (err) {
      lastError = err;
      try { stream?.controller?.abort?.(); } catch { /* never opened */ }
      console.error(`AI provider "${p.label}" stream failed:`, (err as Error)?.message);
      void markFailed(p, err);
      if (!worthRetrying(err)) break;
      // No time left to try another key — the caller needs the error now.
      if (Date.now() > deadline - FIRST_TOKEN_MS) break;
    }
  }

  throw lastError ?? new NoProviderError();
}

/** The client and model for speech to text, from the first usable provider. */
export async function audioProvider(): Promise<{ client: OpenAI; model: string; provider: Provider }> {
  const providers = await loadProviders();
  if (!providers.length) throw new NoProviderError();
  const p = providers[0];
  return {
    client: clientFor(p),
    model: p.transcribeModel || process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1",
    provider: p,
  };
}

/** Try every provider for audio, in order. Used by the transcription fallback path. */
export async function eachProvider(): Promise<Provider[]> {
  return loadProviders();
}

export async function reportOk(p: Provider) { await markOk(p); }
export async function reportFailed(p: Provider, err: unknown) { await markFailed(p, err); }

/**
 * Check one key without saving it, for the "Test" button in the admin panel.
 * A tiny completion is the only honest check: listing models succeeds on keys
 * that have no quota left.
 */
export async function testProvider(p: Provider): Promise<{ ok: true; reply: string } | { ok: false; error: string }> {
  try {
    const client = clientFor(p);
    const res = await (client.chat.completions.create as any)({
      model: p.model,
      max_tokens: 5,
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
    });
    const reply = res?.choices?.[0]?.message?.content?.trim() ?? "";
    return reply ? { ok: true, reply } : { ok: false, error: "The provider answered, but with nothing in it." };
  } catch (err) {
    return { ok: false, error: explain(err) };
  }
}

/**
 * What to tell the *student* when a tool fails.
 *
 * `explain()` is for the admin dashboard — a student can do nothing about a base
 * URL. Three cases are worth separating out, because each one has a different
 * next step: nothing is set up (tell the admin), it ran out of time (try again),
 * everything else (the tool's own wording).
 */
export function aiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { message?: string })?.message ?? String(err);
  const status = (err as { status?: number })?.status;

  if (err instanceof NoProviderError || /no ai provider is configured/i.test(message))
    return "No AI key is set up yet. An admin needs to add one under Admin → AI keys.";
  if (status === 429)
    return "The AI is busy or out of credit at the moment. Your allowance was not used — try again shortly.";
  if (/timeout|timed out|aborted|went quiet|sent nothing|without sending any text/i.test(message))
    return "The AI took too long to answer. Your allowance was not used — please try again.";
  return fallback;
}

/** Turn a provider error into something an admin can act on. */
export function explain(err: unknown): string {
  const e = err as { status?: number; message?: string; code?: string };
  const message = e?.message ?? String(err);
  switch (e?.status) {
    case 401: return "The key was rejected. Check it is copied in full and has not been revoked.";
    case 403: return "The key is valid but not allowed to use this model. Check the model name and the account's access.";
    case 404: return `No model called "${message.match(/model[^\w]*([\w.:-]+)/i)?.[1] ?? "that"}" at this provider. Check the model name and the base URL.`;
    case 429: return "Out of quota or rate limited. Either the account has no credit left, or too many requests went out at once.";
    default:
      if (e?.status && e.status >= 500) return "The provider is having trouble at its end. Try again shortly.";
      if (/fetch failed|ENOTFOUND|ECONNREFUSED/i.test(message)) return "Could not reach the provider. Check the base URL.";
      return message.slice(0, 300);
  }
}

/* ------------------------------------------------------------------ */

/** Nothing useful comes back under this, once a model has thought to itself. */
const MIN_OUTPUT_TOKENS = num(process.env.AI_MIN_OUTPUT_TOKENS, 2000);

/** Other providers differ on a few parameters, so adapt requests in ONE place. */
function patchForCompat(c: OpenAI, baseUrl: string) {
  const completions = c.chat.completions as any;
  const original = completions.create.bind(completions);
  const multiplier = num(process.env.AI_TOKEN_MULTIPLIER, 3); // "thinking" models spend output tokens internally

  // Gemini's 2.5 models think before answering and bill that thinking against
  // the output budget. On a small budget they can use all of it reasoning and
  // return an empty message, which looks exactly like a broken key. Turning the
  // thinking off is the fix; if the provider does not know the field, the call
  // below drops it and tries again, so an unknown provider is not punished for it.
  const geminiStyle = /generativelanguage\.googleapis\.com/i.test(baseUrl);
  const quietThinking = geminiStyle && process.env.AI_THINKING !== "on";

  completions.create = async (params: any, options?: any) => {
    const p = { ...params };

    // A floor as well as a multiplier: three times a small number is still small.
    if (p.max_tokens) p.max_tokens = Math.max(MIN_OUTPUT_TOKENS, Math.ceil(p.max_tokens * multiplier));
    if (quietThinking && p.reasoning_effort === undefined) p.reasoning_effort = "none";

    // Strict structured outputs may not be supported: fall back to "reply with JSON" in the prompt.
    const rf = p.response_format;
    if (rf) {
      delete p.response_format;
      if (rf.type === "json_schema" && rf.json_schema?.schema) {
        const hint = `\n\nRespond with ONLY valid JSON (no markdown, no commentary) matching this JSON schema:\n${JSON.stringify(rf.json_schema.schema)}`;
        const msgs = [...p.messages];
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "user") { msgs[i] = { ...msgs[i], content: msgs[i].content + hint }; break; }
        }
        p.messages = msgs;
      } else if (rf.type === "json_object") {
        p.messages = [...p.messages, { role: "user", content: "Reply with ONLY valid JSON. No markdown, no commentary." }];
      }
    }

    try {
      return await original(p, options);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (p.reasoning_effort !== undefined && (status === 400 || status === 404 || status === 422)) {
        // This provider does not take the thinking switch. Send it without.
        const { reasoning_effort, ...rest } = p;
        return await original(rest, options);
      }
      throw err;
    }
  };
}

/* ------------------------------------------------------------------ */
/* Helpers used across the routes                                      */
/* ------------------------------------------------------------------ */

/**
 * Kept so routes can carry on passing `model: MODEL`. complete() overrides it
 * with the model of whichever provider answers, so this is only a placeholder.
 */
export const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/** Trim and cap user input. */
export function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Pull a JSON object/array out of a model reply that may contain extra text. */
export function extractJson<T = any>(text: string, kind: "object" | "array"): T | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const m = cleaned.match(kind === "array" ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

export async function readJson(req: Request): Promise<any> {
  try { return await req.json(); } catch { return {}; }
}

/**
 * The pieces the tests exercise directly. Nothing in the app imports this: the
 * stream watchdog and the compatibility shim are where the bugs live, and they
 * are not reachable from outside without a real provider on the other end.
 */
export const __internals = { textOf, nextWithin, drain, worthRetrying, patchForCompat, MIN_OUTPUT_TOKENS, StallError, EmptyStreamError };
