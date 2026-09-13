/**
 * GET /api/economic/v1/get-energy-prices
 *
 * Real energy spot/futures from Yahoo Finance v8 (keyless):
 * WTI, Brent, Henry Hub gas, European TTF, gasoline, heating oil.
 * Wire shape: { prices: [{commodity, name, price, unit, change, priceAt}] }
 */

import { getQuote } from "@/lib/wm-market";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ENERGY: Array<{ key: string; symbol: string; name: string; unit: string }> = [
  { key: "wti", symbol: "CL=F", name: "WTI Crude", unit: "USD/bbl" },
  { key: "brent", symbol: "BZ=F", name: "Brent Crude", unit: "USD/bbl" },
  { key: "production", symbol: "BZ=F", name: "Brent (production ref)", unit: "USD/bbl" },
  { key: "inventory", symbol: "CL=F", name: "WTI (inventory ref)", unit: "USD/bbl" },
  { key: "natgas", symbol: "NG=F", name: "Natural Gas (HH)", unit: "USD/MMBtu" },
  { key: "ttf", symbol: "TTF=F", name: "TTF EU Gas", unit: "EUR/MWh" },
  { key: "gasoline", symbol: "RB=F", name: "Gasoline RBOB", unit: "USD/gal" },
  { key: "heating", symbol: "HO=F", name: "Heating Oil", unit: "USD/gal" },
];

export async function GET() {
  const settled = await Promise.all(
    ENERGY.map(async (e) => {
      const q = await getQuote(e.symbol);
      return {
        commodity: e.key,
        name: e.name,
        price: q?.price ?? 0,
        unit: e.unit,
        change: q?.change ?? 0,
        priceAt: q?.fetchedAt ?? Date.now(),
      };
    }),
  );

  return Response.json(
    { prices: settled },
    { headers: { "cache-control": "public, max-age=120" } },
  );
}
