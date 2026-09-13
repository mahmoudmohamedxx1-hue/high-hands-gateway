/**
 * YouTube live-video resolver — replaces the Vite middleware whose regex no
 * longer matches YouTube's page. Scrapes the channel's /live page server-side
 * with a consent-bypass cookie and multiple extraction patterns.
 *
 * GET /api/youtube/live?channel=@handle
 *   → { videoId: string|null, isLive: boolean, channel: string }
 */

import { fetchUpstream } from "@/lib/wm-backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CacheEntry {
  at: number;
  videoId: string | null;
  isLive: boolean;
}
const cache = new Map<string, CacheEntry>();
const POSITIVE_TTL = 5 * 60_000;
const NEGATIVE_TTL = 60_000;

function extractVideoId(html: string): { videoId: string | null; isLive: boolean } {
  // The /live page embeds the current video's id 2-3 times before any
  // recommendation ids, so the first id that repeats consecutively is the
  // page's own video.
  const ids = [...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]);
  let videoId: string | null = null;
  if (ids.length) {
    if (ids.length > 1 && ids[0] === ids[1]) videoId = ids[0];
    else videoId = ids[0];
  }
  if (!videoId) {
    const canonical = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
    if (canonical?.[1]) videoId = canonical[1];
  }
  const isLive =
    html.includes('"isLive":true') ||
    /"simpleText":"[^"]*(\|\s*Live|LIVE\b)[^"]*"/.test(html) ||
    /liveStreamOnScreenRenderer/.test(html);
  return { videoId, isLive };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const channel = url.searchParams.get("channel") ?? "";
  if (!channel.startsWith("@")) {
    return Response.json({ videoId: null, isLive: false, channel }, { headers: { "cache-control": "no-store" } });
  }

  const cached = cache.get(channel);
  const ttl = cached?.videoId ? POSITIVE_TTL : NEGATIVE_TTL;
  if (cached && Date.now() - cached.at < ttl) {
    return Response.json(
      { videoId: cached.videoId, isLive: cached.isLive, channel },
      { headers: { "cache-control": `public, max-age=${Math.ceil(ttl / 1000)}` } },
    );
  }

  let result: { videoId: string | null; isLive: boolean } = { videoId: null, isLive: false };
  const handle = channel.slice(1);
  const cookie = "SOCS=CAI; CONSENT=YES+cb.20240101-01-p0.en+FX+000; PREF=hl=en&gl=US";
  try {
    // 1) /live — the dedicated live page (canonical when a stream is up).
    const res = await fetchUpstream(
      `https://www.youtube.com/@${encodeURIComponent(handle)}/live?hl=en&gl=US`,
      {
        headers: { cookie, accept: "text/html,application/xhtml+xml" },
        redirect: "follow",
      },
      15_000,
    );
    if (res.ok) {
      const html = await res.text();
      result = extractVideoId(html);
    }
  } catch (error) {
    console.warn("[youtube/live] scrape failed:", channel, error);
  }
  // 2) /streams fallback — channels with no "live now" redirect here anyway;
    //    the newest stream video is still embeddable. Fixes the
    //    isLive-true-but-videoId-null shape (LIVE badge on a consent shell).
  if (!result.videoId) {
    try {
      const res = await fetchUpstream(
        `https://www.youtube.com/@${encodeURIComponent(handle)}/streams?hl=en&gl=US`,
        {
          headers: { cookie, accept: "text/html,application/xhtml+xml" },
          redirect: "follow",
        },
        12_000,
      );
      if (res.ok) {
        const html = await res.text();
        const ids = [...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((m) => m[1]);
        // The streams tab lists live streams first (LIVE badge), then recent
        // VODs; the first id is the channel's newest stream either way.
        if (ids.length > 0) {
          result = { videoId: ids[0]!, isLive: /"label":"LIVE"|liveStreamOnScreenRenderer/.test(html) };
        }
      }
    } catch {
      // /streams also unavailable — keep the null result.
    }
  }

  cache.set(channel, { at: Date.now(), ...result });
  return Response.json(
    { videoId: result.videoId, isLive: result.isLive, channel },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
