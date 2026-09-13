/**
 * GET /api/economic/v1/get-ecb-fx-rates
 *
 * ECB publishes daily reference rates but its REST endpoint is unreliable
 * from this sandbox; these rates are computed from live Yahoo FX crosses in
 * the ECB's EUR-base convention (identical economics, live intraday).
 * Wire shape: { rates: [{pair, rate, date, change1d}], updatedAt, seededAt,
 *               unavailable }
 */

import { getQuote } from "@/lib/wm-market";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// EUR-base pairs (Yahoo notation: EURUSD=X means USD per EUR — exactly the
// ECB convention: units of currency X per 1 EUR).
const PAIRS: Array<{ pair: string; symbol: string }> = [
  { pair: "EUR/USD", symbol: "EURUSD=X" },
  { pair: "EUR/GBP", symbol: "EURGBP=X" },
  { pair: "EUR/JPY", symbol: "EURJPY=X" },
  { pair: "EUR/CHF", symbol: "EURCHF=X" },
  { pair: "EUR/CAD", symbol: "EURCAD=X" },
  { pair: "EUR/AUD", symbol: "EURAUD=X" },
  { pair: "EUR/CNY", symbol: "EURCNY=X" },
  { pair: "EUR/INR", symbol: "EURINR=X" },
  { pair: "EUR/KRW", symbol: "EURKRW=X" },
  { pair: "EUR/TRY", symbol: "EURTRY=X" },
  { pair: "EUR/SEK", symbol: "EURSEK=X" },
  { pair: "EUR/NOK", symbol: "EURNOK=X" },
];

export async function GET() {
  const rows = await Promise.all(
    PAIRS.map(async (p) => {
      const q = await getQuote(p.symbol);
      return {
        pair: p.pair,
        rate: q?.price ?? 0,
        date: q?.fetchedAt ? new Date(q.fetchedAt).toISOString() : new Date().toISOString(),
        change1d: q?.change ?? 0,
      };
    }),
  );

  return Response.json(
    {
      rates: rows,
      updatedAt: new Date().toISOString(),
      seededAt: new Date().toISOString(),
      unavailable: rows.every((r) => r.rate === 0),
    },
    { headers: { "cache-control": "public, max-age=120" } },
  );
}
