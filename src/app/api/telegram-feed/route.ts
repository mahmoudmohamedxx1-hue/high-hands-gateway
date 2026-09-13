/**
 * Telegram intel feed — scrapes the PUBLIC t.me/s/<handle> preview pages for
 * the product's curated channel list (worldmonitor data/telegram-channels.json).
 * The upstream edge function proxies a relay scraper that is not available in
 * this sandbox; t.me preview pages are public and reachable, so this route
 * reimplements the aggregation with the same wire shape:
 *
 * { source, earlySignal, enabled, count, updatedAt, items: TelegramItem[] }
 */

import { readFile } from "fs/promises";
import { fetchUpstream } from "@/lib/wm-backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHANNELS_PATH = "/home/z/worldmonitor/data/telegram-channels.json";

interface ChannelDef {
  handle: string;
  label: string;
  topic?: string;
  tier?: number;
  enabled?: boolean;
  maxMessages?: number;
}

interface TelegramItem {
  id: string;
  source: "telegram";
  channel: string;
  channelTitle: string;
  url: string;
  ts: string;
  text: string;
  topic: string;
  tags: string[];
  earlySignal: boolean;
  mediaUrls?: string[];
}

const CHANNEL_FETCH_CAP = 10;
const feedCache = { at: 0, items: [] as TelegramItem[] };
const FEED_TTL_MS = 3 * 60_000;

function decodeEntities(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseTmePage(html: string, handle: string, label: string, topic: string, max: number): TelegramItem[] {
  const items: TelegramItem[] = [];
  const blocks = html.split('class="tgme_widget_message ');
  for (const block of blocks.slice(1)) {
    const post = block.match(/data-post="([^"/]+)\/(\d+)"/);
    if (!post) continue;
    const timeMatch = block.match(/<time[^>]*datetime="([^"]+)"/);
    const textMatch = block.match(
      /class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    );
    const photoMatch = block.match(/background-image:url\('([^']+)'\)/);
    const text = textMatch ? decodeEntities(textMatch[1]) : "";
    if (!text && !photoMatch) continue;

    items.push({
      id: `tg-${post[1]}-${post[2]}`,
      source: "telegram",
      channel: `@${handle}`,
      channelTitle: label,
      url: `https://t.me/${post[1]}/${post[2]}`,
      ts: timeMatch ? timeMatch[1] : new Date().toISOString(),
      text: text.slice(0, 900),
      topic,
      tags: [],
      earlySignal: false,
      ...(photoMatch ? { mediaUrls: [photoMatch[1]] } : {}),
    });
    if (items.length >= max) break;
  }
  return items;
}

async function loadChannels(): Promise<ChannelDef[]> {
  try {
    const raw = await readFile(CHANNELS_PATH, "utf8");
    const data = JSON.parse(raw) as { channels?: Record<string, ChannelDef[]> };
    const list = data.channels?.full ?? [];
    return list
      .filter((c) => c.enabled !== false)
      .sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9))
      .slice(0, CHANNEL_FETCH_CAP);
  } catch {
    return [];
  }
}

async function buildFeed(limit: number): Promise<TelegramItem[]> {
  if (feedCache.items.length && Date.now() - feedCache.at < FEED_TTL_MS) {
    return feedCache.items.slice(0, limit);
  }
  const channels = await loadChannels();
  const results = await Promise.allSettled(
    channels.map(async (c) => {
      const res = await fetchUpstream(`https://t.me/s/${c.handle}`, { headers: { accept: "text/html" } }, 10_000);
      if (!res.ok) throw new Error(`${c.handle}:${res.status}`);
      return parseTmePage(await res.text(), c.handle, c.label, c.topic ?? "intel", c.maxMessages ?? 15);
    }),
  );
  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  items.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  if (items.length) {
    feedCache.at = Date.now();
    feedCache.items = items;
  }
  return items.slice(0, limit);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 100);

  if (mode === "resolve" || mode === "channel") {
    return Response.json(
      {
        source: "telegram",
        earlySignal: false,
        enabled: true,
        count: 0,
        updatedAt: new Date().toISOString(),
        items: [],
        ...(mode === "resolve" ? { resolved: false, username: url.searchParams.get("username") ?? "" } : {}),
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const items = await buildFeed(limit);
  return Response.json(
    {
      source: "telegram",
      earlySignal: items.length > 0,
      enabled: true,
      count: items.length,
      updatedAt: items.length ? items[0].ts : new Date().toISOString(),
      items,
    },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
