/**
 * GET /api/market/v1/list-commodity-quotes?symbols=GC=F... (empty = full set)
 *
 * Real commodity/FX quotes from Yahoo Finance v8 (keyless): gold, silver,
 * copper, platinum, palladium, aluminum, oil, gas, wheat, FX pairs...
 */

import { sweepQuotes, COMMODITY_CATALOG } from "@/lib/wm-market";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.getAll("symbols").filter(Boolean);

  // Upstream contract: an explicitly requested but unknown symbol is a 400
  // with field violations; an empty symbol list means "the default set".
  const unknown = requested.filter((s) => !(s in COMMODITY_CATALOG));
  if (requested.length > 0 && unknown.length > 0) {
    return Response.json(
      {
        violations: unknown.map((symbol) => ({
          field: "symbols",
          description: `unsupported commodity symbol: ${symbol}`,
        })),
      },
      { status: 400 },
    );
  }

  const symbols = requested.length > 0 ? requested : Object.keys(COMMODITY_CATALOG);
  const { quotes } = await sweepQuotes(symbols, COMMODITY_CATALOG);

  return Response.json(
    { quotes },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
