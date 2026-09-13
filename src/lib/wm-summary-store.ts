/** Shared in-memory store for AI summaries (used by summarize-article + -cache routes). */

export const summaryCache = new Map<string, { at: number; summary: string; model: string }>();
export const SUMMARY_TTL_MS = 30 * 60_000;
