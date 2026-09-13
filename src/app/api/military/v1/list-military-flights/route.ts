/**
 * GET /api/military/v1/list-military-flights?pageSize=0&cursor=&neLat=&neLon=&swLat=&swLon=
 *
 * Real military aircraft from adsb.lol /v2/mil (keyless community ADS-B feed,
 * the seeder's tier-1 source). The production pipeline serves a Redis seed
 * written by the Railway seeder; this sandbox serves the live feed directly
 * in the same proto wire shape.
 */

import { getMilitaryAircraft, classifyAircraft, OPERATOR_ENUM, TYPE_ENUM } from "@/lib/wm-military";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FLIGHTS = 600;

function toNum(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

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
  // The generated client serializes camelCase proto fields as snake_case
  // (sw_lat / ne_lon); curl users often send camelCase. Accept both.
  const swLat = bboxParam(url, "swLat", "sw_lat");
  const swLon = bboxParam(url, "swLon", "sw_lon");
  const neLat = bboxParam(url, "neLat", "ne_lat");
  const neLon = bboxParam(url, "neLon", "ne_lon");
  const hasBbox = [swLat, swLon, neLat, neLon].every((n) => Number.isFinite(n));

  const rows = (await getMilitaryAircraft()) ?? [];

  const now = Date.now();
  const flights: Array<Record<string, unknown>> = [];

  for (const ac of rows) {
    if (typeof ac.lat !== "number" || typeof ac.lon !== "number") continue;
    if (hasBbox && (ac.lat < swLat || ac.lat > neLat || ac.lon < swLon || ac.lon > neLon)) continue;
    // Drop aircraft whose last position report is ancient (feed hygiene).
    if (typeof ac.seen_pos === "number" && ac.seen_pos > 120) continue;

    const callsign = (ac.flight ?? "").trim() || `UNKN-${(ac.hex ?? "").slice(0, 4).toUpperCase()}`;
    const cls = classifyAircraft(callsign, ac.t);
    const onGround = ac.alt_baro === "ground";
    const altitudeFt = onGround ? 0 : toNum(ac.alt_baro as number);

    flights.push({
      id: `adsblol-${ac.hex}`,
      callsign,
      hexCode: (ac.hex ?? "").toUpperCase(),
      registration: ac.r ?? "",
      aircraftType: TYPE_ENUM[cls.aircraftType],
      aircraftModel: ac.t ?? "",
      operator: OPERATOR_ENUM[cls.operator],
      operatorCountry: cls.operatorCountry,
      location: { latitude: ac.lat, longitude: ac.lon },
      altitude: Math.round(altitudeFt),
      heading: Math.round(toNum(ac.track)),
      speed: Math.round(toNum(ac.gs)),
      verticalRate: Math.round(toNum(ac.baro_rate ?? ac.geom_rate)),
      onGround,
      squawk: ac.squawk ?? "",
      origin: "",
      destination: "",
      lastSeenAt: now - Math.round(toNum(ac.seen) * 1000),
      firstSeenAt: 0,
      confidence:
        cls.confidence === "high"
          ? "MILITARY_CONFIDENCE_HIGH"
          : cls.confidence === "medium"
            ? "MILITARY_CONFIDENCE_MEDIUM"
            : "MILITARY_CONFIDENCE_LOW",
      isInteresting: false,
      note: "",
      source: "adsb.lol",
    });
    if (flights.length >= MAX_FLIGHTS) break;
  }

  return Response.json(
    {
      flights,
      clusters: [],
      pagination: { nextCursor: "", totalCount: flights.length },
    },
    { headers: { "cache-control": "public, max-age=15" } },
  );
}
