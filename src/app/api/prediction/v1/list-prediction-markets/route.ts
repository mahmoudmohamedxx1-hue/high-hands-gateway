/**
 * GET /api/prediction/v1/list-prediction-markets?category=politics&pageSize=50
 *
 * Real prediction markets from Polymarket's public Gamma API (keyless).
 * Mirrors the repo seeder's query: events by tag_slug, ordered by volume,
 * each event reduced to its highest-volume market. yesPrice is 0..1 on the
 * wire (the client multiplies by 100).
 */

import { fetchUpstream } from "@/lib/wm-backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TAG_POOLS: Record<string, string[]> = {
  politics: ["politics", "geopolitics", "elections", "world", "ukraine", "middle-east"],
  ai: ["ai", "tech", "science"],
  economy: ["economy", "fed", "inflation", "markets"],
  tech: ["ai", "tech", "crypto", "science"],
  finance: ["economy", "fed", "inflation", "markets"],
  geopolitical: ["politics", "geopolitics", "world", "ukraine"],
};

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; markets: unknown[] }>();
const inflight = new Map<string, Promise<unknown[]>>();

interface GammaMarket {
  id?: number | string;
  question?: string;
  outcomePrices?: string;
  volume?: number | string;
  volumeNum?: number;
  endDate?: string;
  closed?: boolean;
  active?: boolean;
  archived?: boolean;
}

interface GammaEvent {
  id?: number | string;
  slug?: string;
  title?: string;
  endDate?: string;
  closed?: boolean;
  volume?: number | string;
  markets?: GammaMarket[];
}

function parseYes(market: GammaMarket): number | null {
  try {
    const prices = JSON.parse(market.outcomePrices || "[]") as string[];
    const p = parseFloat(prices[0] ?? "");
    if (!Number.isNaN(p) && p >= 0 && p <= 1) return p;
  } catch {
    /* unreadable */
  }
  return null;
}

function volumeOf(m: GammaMarket): number {
  const v = Number(m.volumeNum ?? m.volume);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

async function fetchEventsByTag(tag: string): Promise<GammaEvent[]> {
  const params = new URLSearchParams({
    tag_slug: tag,
    closed: "false",
    active: "true",
    archived: "false",
    end_date_min: new Date().toISOString(),
    order: "volume",
    ascending: "false",
    limit: "60",
  });
  const res = await fetchUpstream(
    `https://gamma-api.polymarket.com/events?${params}`,
    { headers: { accept: "application/json" } },
    12_000,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data as GammaEvent[];
}

function reduceEvents(events: GammaEvent[], category: string): unknown[] {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const event of events) {
    const active = (event.markets ?? []).filter(
      (m) => !m.closed && m.active !== false && m.archived !== true,
    );
    if (active.length === 0) continue;
    const top = active.reduce((best, m) => (volumeOf(m) > volumeOf(best) ? m : best));
    const yes = parseYes(top);
    if (yes === null) continue;
    const key = String(event.id ?? top.id ?? top.question ?? "");
    if (seen.has(key)) continue;
    seen.add(key);
    const closesAt = Date.parse(top.endDate ?? event.endDate ?? "");
    out.push({
      id: `polymarket-${event.id ?? key}`,
      title: top.question || event.title || "",
      yesPrice: yes,
      volume: volumeOf(top),
      url: `https://polymarket.com/event/${event.slug ?? ""}`,
      closesAt: Number.isFinite(closesAt) ? closesAt : 0,
      category,
      source: "MARKET_SOURCE_POLYMARKET",
    });
  }
  return out;
}

async function loadPool(category: string): Promise<unknown[]> {
  const tags = TAG_POOLS[category] ?? TAG_POOLS.politics;
  const perTag = await Promise.all(
    tags.map((tag) =>
      fetchEventsByTag(tag).catch((err) => {
        console.warn("[predictions] gamma tag failed:", tag, String(err));
        return [] as GammaEvent[];
      }),
    ),
  );
  const merged = reduceEvents(perTag.flat(), category);
  // Highest volume first, cap at 50 like the seeder's published pools.
  merged.sort((a, b) => Number((b as { volume?: number }).volume ?? 0) - Number((a as { volume?: number }).volume ?? 0));
  return merged.slice(0, 50);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") || "politics";
  const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? 50) || 50, 1), 100);

  const hit = cache.get(category);
  let markets: unknown[];
  if (hit && Date.now() - hit.at < TTL_MS) {
    markets = hit.markets;
  } else {
    let job = inflight.get(category);
    if (!job) {
      job = loadPool(category).then((m) => {
        cache.set(category, { at: Date.now(), markets: m });
        return m;
      }).finally(() => inflight.delete(category));
      inflight.set(category, job);
    }
    markets = (await job) ?? [];
    if (markets.length === 0 && hit) markets = hit.markets; // serve stale on upstream failure
  }

  return Response.json(
    {
      markets: markets.slice(0, pageSize),
      pagination: { nextCursor: "", totalCount: markets.length },
      fetchedAt: Date.now(),
      dataAvailable: markets.length > 0,
    },
    { headers: { "cache-control": "public, max-age=120" } },
  );
}
