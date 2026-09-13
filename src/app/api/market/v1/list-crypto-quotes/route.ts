/**
 * GET /api/market/v1/list-crypto-quotes
 *
 * Real crypto quotes from CoinGecko's free API (keyless, CORS-open).
 * Wire shape: { quotes: [{name, symbol, price, change, sparkline}],
 *               unresolvedIds: [], provider: 'coingecko' }
 */

import { fetchUpstream } from "@/lib/wm-backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TTL_MS = 3 * 60_000;
let cache: { at: number; body: unknown } | null = null;
let inflight: Promise<void> | null = null;

const IDS = [
  "bitcoin", "ethereum", "tether", "binancecoin", "solana", "ripple",
  "usd-coin", "cardano", "dogecoin", "avalanche-2", "tron", "chainlink",
  "polkadot", "matic-network", "litecoin", "shiba-inu", "uniswap",
  "internet-computer", "near", "aptos", "arbitrum", "optimism",
  "filecoin", "cosmos", "hedera-hashgraph", "crypto-com-chain",
  "stellar", "monero", "ethereum-classic", "algorand",
];

async function refresh(): Promise<void> {
  try {
    const res = await fetchUpstream(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${IDS.join(",")}&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h`,
      { headers: { accept: "application/json" } },
      15_000,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = (await res.json()) as Array<{
      id: string;
      name: string;
      symbol: string;
      current_price: number;
      price_change_percentage_24h: number | null;
      sparkline_in_7d?: { price?: number[] };
    }>;
    const body = {
      quotes: rows.map((r) => {
        const spark = r.sparkline_in_7d?.price ?? [];
        // Down-sample the 7d series to <=80 points for the row sparklines.
        let series = spark.filter((v) => Number.isFinite(v));
        if (series.length > 80) {
          const step = Math.ceil(series.length / 80);
          series = series.filter((_, i) => i % step === 0);
        }
        return {
          name: r.name,
          symbol: (r.symbol ?? "").toUpperCase(),
          price: r.current_price,
          change: r.price_change_percentage_24h ?? 0,
          sparkline: series,
        };
      }),
      unresolvedIds: [],
      provider: "coingecko",
    };
    cache = { at: Date.now(), body };
  } catch (err) {
    console.warn("[crypto-quotes] coingecko failed:", String(err));
    if (!cache) {
      cache = { at: Date.now(), body: { quotes: [], unresolvedIds: [], provider: "degraded" } };
    }
  }
}

export async function GET() {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    if (!inflight) {
      inflight = refresh().finally(() => {
        inflight = null;
      });
    }
    await inflight;
  }
  const body = cache?.body ?? { quotes: [], unresolvedIds: [], provider: "degraded" };
  return Response.json(body, { headers: { "cache-control": "public, max-age=60" } });
}
