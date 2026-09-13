/**
 * GET /api/market/v1/get-sector-summary
 *
 * Real sector performance from Yahoo Finance v8 (keyless) via sector ETFs.
 */

import { mapLimit, getQuote, SECTOR_ETFS } from "@/lib/wm-market";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const sectors = await mapLimit(SECTOR_ETFS, 4, async ({ symbol, name }) => {
    const q = await getQuote(symbol);
    return { symbol, name, change: q?.change ?? 0 };
  });

  return Response.json(
    { sectors },
    { headers: { "cache-control": "public, max-age=120" } },
  );
}
