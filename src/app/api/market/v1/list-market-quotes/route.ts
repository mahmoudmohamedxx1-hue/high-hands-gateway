/**
 * GET /api/market/v1/list-market-quotes?symbols=^GSPC&symbols=AAPL...
 *
 * Real quotes from Yahoo Finance v8 (keyless). Replaces the seed-first
 * Vercel/Redis pipeline which returns SEED_UNAVAILABLE in this sandbox.
 */

import { sweepQuotes, STOCK_CATALOG } from "@/lib/wm-market";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.getAll("symbols").filter(Boolean);
  const symbols = requested.length > 0 ? requested : Object.keys(STOCK_CATALOG);

  const { quotes, unavailable } = await sweepQuotes(symbols, STOCK_CATALOG);

  return Response.json(
    {
      quotes,
      finnhubSkipped: false,
      skipReason: quotes.length > 0 ? "" : "upstream unavailable",
      rateLimited: false,
      unavailableSymbols: unavailable.map((symbol) => ({
        symbol,
        reason: "MARKET_QUOTE_UNAVAILABLE_REASON_SEED_UNAVAILABLE",
      })),
      asOf: new Date().toISOString(),
    },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
