/**
 * GET /api/aviation/v1/track-aircraft?swLat=&swLon=&neLat=&neLon=
 *
 * Real civil aircraft positions from adsb.lol (keyless) for the live `flights`
 * map layer (deck.gl viewport query at zoom >= 2). Wire shape matches the
 * generated client: {positions, source, updatedAt}.
 */

import { getAircraftByBbox } from "@/lib/wm-military";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bboxParam(url: URL, ...names: string[]): number {
  for (const name of names) {
    const raw = url.searchParams.get(name);
    if (raw != null && raw.trim() !== "") {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  // Accept both camelCase and the client's snake_case serialization.
  const swLat = bboxParam(url, "swLat", "sw_lat");
  const swLon = bboxParam(url, "swLon", "sw_lon");
  const neLat = bboxParam(url, "neLat", "ne_lat");
  const neLon = bboxParam(url, "neLon", "ne_lon");

  if (![swLat, swLon, neLat, neLon].every((n) => Number.isFinite(n))) {
    return Response.json(
      { positions: [], source: "none", updatedAt: Date.now() },
      { status: 400 },
    );
  }

  const rows = (await getAircraftByBbox(swLat, swLon, neLat, neLon)) ?? [];

  const positions = rows
    .filter((ac) => typeof ac.lat === "number" && typeof ac.lon === "number")
    .slice(0, 800)
    .map((ac) => {
      const onGround = ac.alt_baro === "ground";
      const altFt = onGround ? 0 : typeof ac.alt_baro === "number" ? ac.alt_baro : 0;
      return {
        icao24: (ac.hex ?? "").toLowerCase(),
        callsign: (ac.flight ?? "").trim(),
        lat: ac.lat!,
        lon: ac.lon!,
        altitudeM: Math.round(altFt * 0.3048),
        groundSpeedKts: typeof ac.gs === "number" ? Math.round(ac.gs) : 0,
        trackDeg: typeof ac.track === "number" ? Math.round(ac.track) : 0,
        verticalRate:
          typeof ac.geom_rate === "number" ? Math.round(ac.geom_rate * 0.00508) : 0, // ft/min → m/s
        onGround,
        source: "adsb.lol",
      };
    });

  return Response.json(
    { positions, source: positions.length > 0 ? "adsb.lol" : "none", updatedAt: Date.now() },
    { headers: { "cache-control": "public, max-age=10" } },
  );
}
