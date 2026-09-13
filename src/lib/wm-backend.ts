/**
 * Shared helpers for the World Monitor sandbox backend routes.
 *
 * These routes are carved out of the reverse proxy (see src/proxy.ts) and
 * implemented natively in Next.js so they can use z-ai-web-dev-sdk (backend
 * only) and add caching that the upstream Vite dev API layer lacks.
 */

import { createHash } from "crypto";
import dns from "dns";
import ZAI from "z-ai-web-dev-sdk";

// This sandbox has a black-holed IPv6 route: Node's default address ordering
// tries IPv6 first and the TCP connect silently times out (undici surfaces it
// as "TypeError: fetch failed / ETIMEDOUT"). Prefer IPv4 for every outbound
// request from the sandbox API layer.
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Older runtimes without the option keep default behavior.
}

/** The Vite dev server that hosts the original runtime data layer. */
export const VITE_ORIGIN = process.env.WORLD_MONITOR_ORIGIN ?? "http://localhost:3001";

// ── z-ai singleton ──────────────────────────────────────────────────────────

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>;
let zaiPromise: Promise<ZaiClient> | null = null;

export function getZai(): Promise<ZaiClient> {
  zaiPromise ??= ZAI.create();
  return zaiPromise;
}

// ── generic fetch helper ────────────────────────────────────────────────────

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function fetchUpstream(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    headers: {
      "user-agent": BROWSER_UA,
      "accept-language": "en-US,en;q=0.9",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

// ── news digest cache (SWR) ─────────────────────────────────────────────────

export interface DigestCategory {
  items: Array<{
    source: string;
    title: string;
    link: string;
    publishedAt: number;
    isAlert: boolean;
    importanceScore?: number;
    credibilityScore?: number;
    category?: string;
    locationName?: string;
    snippet?: string;
    threat?: { level?: string; category?: string };
    tickers?: string[];
  }>;
}
export interface DigestPayload {
  categories?: Record<string, DigestCategory>;
  feedStatuses?: Record<string, string>;
  generatedAt?: string;
  coverage?: Record<string, unknown>;
  [k: string]: unknown;
}

interface DigestCacheEntry {
  at: number;
  data: DigestPayload;
}

const DIGEST_TTL_MS = 3 * 60_000;
const digestCache = new Map<string, DigestCacheEntry>();
const digestInflight = new Map<string, Promise<DigestPayload | null>>();

async function fetchDigestFresh(search: string): Promise<DigestPayload | null> {
  try {
    const res = await fetchUpstream(`${VITE_ORIGIN}/api/news/v1/list-feed-digest?${search}`, {}, 55_000);
    if (!res.ok) return null;
    const data = (await res.json()) as DigestPayload;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

export async function getDigest(search = "variant=full&lang=en", maxAgeMs = DIGEST_TTL_MS): Promise<DigestPayload | null> {
  const cached = digestCache.get(search);
  if (cached && Date.now() - cached.at < maxAgeMs) return cached.data;

  let inflight = digestInflight.get(search);
  if (!inflight) {
    inflight = fetchDigestFresh(search);
    digestInflight.set(search, inflight);
  }
  const fresh = await inflight.finally(() => digestInflight.delete(search));
  if (fresh) {
    digestCache.set(search, { at: Date.now(), data: fresh });
    return fresh;
  }
  if (cached) return cached.data; // stale fallback beats an error
  return null;
}

/** Top stories across digest categories, importance-ranked — LLM context. */
export interface DigestStory {
  title: string;
  source: string;
  link: string;
  category: string;
  importance: number;
  publishedAt: number;
}

export function topDigestStories(digest: DigestPayload | null, limit = 18): DigestStory[] {
  const stories: DigestStory[] = [];
  for (const [category, bucket] of Object.entries(digest?.categories ?? {})) {
    for (const item of bucket?.items ?? []) {
      stories.push({
        title: item.title,
        source: item.source,
        link: item.link,
        category,
        importance: item.importanceScore ?? 0,
        publishedAt: item.publishedAt ?? 0,
      });
    }
  }
  stories.sort((a, b) => b.importance - a.importance);
  return stories.slice(0, limit);
}

// Pre-warm the default digest so the first dashboard load is fast.
void getDigest().catch(() => {});

// ── z-ai chat helper (streaming with buffered fallback) ────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// z-ai enforces a rate limit; serialize completions and retry once on 429 so
// dashboard boot bursts (insights + summarize fan-out) don't hard-fail.
let chatQueue: Promise<unknown> = Promise.resolve();

function withChatSlot<T>(job: () => Promise<T>): Promise<T> {
  const run = chatQueue.then(job, job);
  chatQueue = run.catch(() => {});
  return run;
}

async function isRateLimitError(error: unknown): Promise<boolean> {
  return error instanceof Error && /429|too many requests/i.test(error.message);
}

async function callZai(messages: ChatMessage[], stream: boolean): Promise<unknown> {
  const zai = await getZai();
  return withChatSlot(() =>
    zai.chat.completions.create({
      messages,
      thinking: { type: "disabled" },
      ...(stream ? { stream: true } : {}),
    }),
  );
}

async function callZaiWithRetry(messages: ChatMessage[], stream: boolean): Promise<unknown> {
  try {
    return await callZai(messages, stream);
  } catch (error) {
    if (await isRateLimitError(error)) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return callZai(messages, stream);
    }
    throw error;
  }
}

/**
 * Streams completion deltas. Tries native streaming first; falls back to
 * emitting a buffered completion in small chunks so the UI still "streams".
 */
export async function streamChat(
  messages: ChatMessage[],
  onDelta: (text: string) => void | Promise<void>,
): Promise<string> {
  let full = "";

  type StreamChunk = { choices?: Array<{ delta?: { content?: string } }> };
  type BufferedCompletion = { choices?: Array<{ message?: { content?: string } }> };

  try {
    const completion: unknown = await callZaiWithRetry(messages, true);

    const maybeIterable = completion as { [Symbol.asyncIterator]?: unknown };
    if (completion && typeof maybeIterable[Symbol.asyncIterator] === "function") {
      const stream = completion as AsyncIterable<StreamChunk>;
      for await (const chunk of stream) {
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          await onDelta(delta);
        }
      }
      if (full.trim()) return full;
      throw new Error("empty stream");
    }

    const buffered = completion as BufferedCompletion;
    const content = buffered?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      full = content;
    } else {
      throw new Error("no content");
    }
  } catch {
    // Buffered retry without stream
    const completion = (await callZaiWithRetry(messages, false)) as BufferedCompletion;
    full = completion?.choices?.[0]?.message?.content ?? "";
  }

  // Emit in word-ish chunks for a streaming feel.
  const pieces = full.match(/[\s\S]{1,24}/g) ?? [];
  for (const piece of pieces) {
    await onDelta(piece);
  }
  return full;
}

/** Non-streaming completion helper. */
export async function chatComplete(messages: ChatMessage[], maxTokens?: number): Promise<string> {
  const completion = (await callZaiWithRetry(messages, false)) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = completion?.choices?.[0]?.message?.content ?? "";
  return typeof maxTokens === "number" && maxTokens > 0 ? content.slice(0, maxTokens) : content;
}
