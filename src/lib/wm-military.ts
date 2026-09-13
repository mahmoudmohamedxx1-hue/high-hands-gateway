/**
 * Real ADS-B military + civil aircraft data for the World Monitor sandbox.
 *
 * Upstream: adsb.lol v2 API (keyless, ODbL-licensed community feed) — the
 * same tier-1 source the repo's own seeder uses on Railway. The handler
 * pipeline in this sandbox has no Redis/relay, so these helpers serve the
 * client RPC wire shapes directly.
 *
 * Classification heuristics (callsign → operator/type) are ported from the
 * repo's seeder (scripts/seed-military-flights.mjs CALLSIGN_PATTERNS) so the
 * data matches what the production pipeline would have seeded.
 */

import { fetchUpstream } from "./wm-backend";

// ── adsb.lol feed access with SWR cache ─────────────────────────────────────

const MIL_TTL_MS = 20_000;
let milCache: { at: number; rows: AdsbAircraft[] | null } = { at: 0, rows: null };
let milInflight: Promise<AdsbAircraft[] | null> | null = null;

export interface AdsbAircraft {
  hex: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | "ground";
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  lat?: number;
  lon?: number;
  seen?: number;
  seen_pos?: number;
  category?: string;
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

async function fetchMil(): Promise<AdsbAircraft[] | null> {
  // Two attempts: the community feed is occasionally slow to answer.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchUpstream("https://api.adsb.lol/v2/mil", {}, 15_000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ac?: AdsbAircraft[] };
      if (Array.isArray(data.ac)) return data.ac;
    } catch (err) {
      if (attempt === 1) console.warn("[wm-military] adsb.lol /v2/mil failed:", String(err));
    }
  }
  return null;
}

export async function getMilitaryAircraft(): Promise<AdsbAircraft[] | null> {
  const now = Date.now();
  if (milCache.rows && now - milCache.at < MIL_TTL_MS) return milCache.rows;
  if (!milInflight) {
    milInflight = fetchMil()
      .then((rows) => {
        if (rows) milCache = { at: Date.now(), rows };
        return milCache.rows;
      })
      .finally(() => {
        milInflight = null;
      });
  }
  return milInflight;
}

export async function getAircraftByBbox(
  swLat: number,
  swLon: number,
  neLat: number,
  neLon: number,
): Promise<AdsbAircraft[] | null> {
  const lat = (swLat + neLat) / 2;
  const lon = (swLon + neLon) / 2;
  const diagNm =
    Math.hypot((neLat - swLat) * 60, (neLon - swLon) * 60 * Math.cos((lat * Math.PI) / 180)) / 2;
  const dist = Math.min(Math.max(Math.ceil(diagNm / 1.2), 25), 250); // API cap 250nm
  try {
    const res = await fetchUpstream(
      `https://api.adsb.lol/v2/lat/${lat.toFixed(4)}/lon/${lon.toFixed(4)}/dist/${dist}`,
      {},
      15_000,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { ac?: AdsbAircraft[] };
    const rows = Array.isArray(data.ac) ? data.ac : [];
    return rows.filter(
      (a) => isFiniteNum(a.lat) && isFiniteNum(a.lon) &&
        a.lat! >= swLat && a.lat! <= neLat && a.lon! >= swLon && a.lon! <= neLon,
    );
  } catch (err) {
    console.warn("[wm-military] adsb.lol bbox query failed:", String(err));
    return null;
  }
}

// ── Classification (ported from the seeder's pattern tables) ────────────────

type OperatorKey =
  | "usaf" | "usn" | "usmc" | "usa" | "raf" | "rn" | "faf" | "gaf"
  | "plaaf" | "plan" | "vks" | "iaf" | "nato" | "other";

const OPERATOR_ENUM: Record<OperatorKey, string> = {
  usaf: "MILITARY_OPERATOR_USAF",
  usn: "MILITARY_OPERATOR_USN",
  usmc: "MILITARY_OPERATOR_USMC",
  usa: "MILITARY_OPERATOR_USA",
  raf: "MILITARY_OPERATOR_RAF",
  rn: "MILITARY_OPERATOR_RN",
  faf: "MILITARY_OPERATOR_FAF",
  gaf: "MILITARY_OPERATOR_GAF",
  plaaf: "MILITARY_OPERATOR_PLAAF",
  plan: "MILITARY_OPERATOR_PLAN",
  vks: "MILITARY_OPERATOR_VKS",
  iaf: "MILITARY_OPERATOR_IAF",
  nato: "MILITARY_OPERATOR_NATO",
  other: "MILITARY_OPERATOR_OTHER",
};

const OPERATOR_COUNTRY: Record<OperatorKey, string> = {
  usaf: "USA", usn: "USA", usmc: "USA", usa: "USA",
  raf: "UK", rn: "UK", faf: "France", gaf: "Germany",
  plaaf: "China", plan: "China", vks: "Russia",
  iaf: "Israel", nato: "NATO", other: "Unknown",
};

type TypeKey =
  | "transport" | "fighter" | "bomber" | "tanker" | "awacs"
  | "reconnaissance" | "helicopter" | "drone" | "patrol"
  | "special_ops" | "vip" | "unknown";

const TYPE_ENUM: Record<TypeKey, string> = {
  transport: "MILITARY_AIRCRAFT_TYPE_TRANSPORT",
  fighter: "MILITARY_AIRCRAFT_TYPE_FIGHTER",
  bomber: "MILITARY_AIRCRAFT_TYPE_BOMBER",
  tanker: "MILITARY_AIRCRAFT_TYPE_TANKER",
  awacs: "MILITARY_AIRCRAFT_TYPE_AWACS",
  reconnaissance: "MILITARY_AIRCRAFT_TYPE_RECONNAISSANCE",
  helicopter: "MILITARY_AIRCRAFT_TYPE_HELICOPTER",
  drone: "MILITARY_AIRCRAFT_TYPE_DRONE",
  patrol: "MILITARY_AIRCRAFT_TYPE_PATROL",
  special_ops: "MILITARY_AIRCRAFT_TYPE_SPECIAL_OPS",
  vip: "MILITARY_AIRCRAFT_TYPE_VIP",
  unknown: "MILITARY_AIRCRAFT_TYPE_UNKNOWN",
};

const CALLSIGN_PATTERNS: Array<{ re: RegExp; operator: OperatorKey; type: TypeKey | null }> = [
  // US Air Force
  { re: /^RCH\d/i, operator: "usaf", type: "transport" },
  { re: /^REACH\d/i, operator: "usaf", type: "transport" },
  { re: /^DUKE\d/i, operator: "usaf", type: "transport" },
  { re: /^SAM\d{2,}/i, operator: "usaf", type: "vip" },
  { re: /^AF[12]\d/i, operator: "usaf", type: "vip" },
  { re: /^EXEC\d/i, operator: "usaf", type: "vip" },
  { re: /^GOLD\d/i, operator: "usaf", type: "special_ops" },
  { re: /^KING\d/i, operator: "usaf", type: "tanker" },
  { re: /^SHELL\d/i, operator: "usaf", type: "tanker" },
  { re: /^TEAL\d/i, operator: "usaf", type: "tanker" },
  { re: /^BOLT\d/i, operator: "usaf", type: "fighter" },
  { re: /^VIPER\d/i, operator: "usaf", type: "fighter" },
  { re: /^RAPTOR/i, operator: "usaf", type: "fighter" },
  { re: /^BONE\d/i, operator: "usaf", type: "bomber" },
  { re: /^DEATH\d/i, operator: "usaf", type: "bomber" },
  { re: /^DOOM\d/i, operator: "usaf", type: "bomber" },
  { re: /^SNTRY/i, operator: "usaf", type: "awacs" },
  { re: /^DRAGN/i, operator: "usaf", type: "reconnaissance" },
  { re: /^COBRA\d/i, operator: "usaf", type: "reconnaissance" },
  { re: /^RIVET/i, operator: "usaf", type: "reconnaissance" },
  { re: /^OLIVE\d/i, operator: "usaf", type: "reconnaissance" },
  { re: /^JAKE\d/i, operator: "usaf", type: "reconnaissance" },
  { re: /^NCHO/i, operator: "usaf", type: "special_ops" },
  { re: /^SHADOW\d/i, operator: "usaf", type: "special_ops" },
  { re: /^EVAC\d/i, operator: "usaf", type: "transport" },
  { re: /^MOOSE\d/i, operator: "usaf", type: "transport" },
  { re: /^HERKY/i, operator: "usaf", type: "transport" },
  { re: /^FORTE\d/i, operator: "usaf", type: "drone" },
  { re: /^HAWK\d/i, operator: "usaf", type: "drone" },
  { re: /^REAPER/i, operator: "usaf", type: "drone" },
  { re: /^RAIDR\d/i, operator: "usn", type: "patrol" },
  { re: /^RAIDR?\d/i, operator: "usaf", type: null },
  // US Navy / Marines / Army / Coast Guard
  { re: /^NAVY\d/i, operator: "usn", type: null },
  { re: /^CNV\d/i, operator: "usn", type: "transport" },
  { re: /^VRC\d/i, operator: "usn", type: "transport" },
  { re: /^TRIDENT/i, operator: "usn", type: "patrol" },
  { re: /^BRONCO/i, operator: "usn", type: "fighter" },
  { re: /^MARINE/i, operator: "usmc", type: null },
  { re: /^HMX/i, operator: "usmc", type: "vip" },
  { re: /^ARMY\d/i, operator: "usa", type: null },
  { re: /^PAT\d{2,}/i, operator: "usa", type: "transport" },
  { re: /^DUSTOFF/i, operator: "usa", type: "helicopter" },
  { re: /^COAST GUARD/i, operator: "other", type: "patrol" },
  { re: /^CG\d{3,}/i, operator: "other", type: "patrol" },
  // UK
  { re: /^RNAVY/i, operator: "rn", type: null },
  { re: /^RRR\d/i, operator: "raf", type: null },
  { re: /^ASCOT/i, operator: "raf", type: "transport" },
  { re: /^RAFAIR/i, operator: "raf", type: "transport" },
  { re: /^TARTAN/i, operator: "raf", type: "tanker" },
  // NATO / FR / DE / IL / TR / SA / others
  { re: /^NATO\d/i, operator: "nato", type: "awacs" },
  { re: /^FAF\d/i, operator: "faf", type: null },
  { re: /^CTM\d/i, operator: "faf", type: "transport" },
  { re: /^FRENCH\s?(AIR|MIL|NAVY)/i, operator: "faf", type: null },
  { re: /^GAF\d/i, operator: "gaf", type: null },
  { re: /^GERMAN\s?(AIR|MIL|NAVY)/i, operator: "gaf", type: null },
  { re: /^IAF\d{2,}/i, operator: "iaf", type: null },
  { re: /^TURAF/i, operator: "other", type: null },
  { re: /^TRKAF/i, operator: "other", type: null },
  { re: /^RSAF\d/i, operator: "other", type: null },
  { re: /^UAF\d/i, operator: "other", type: null },
  { re: /^AIR INDIA ONE/i, operator: "other", type: "vip" },
  { re: /^IAM\d/i, operator: "other", type: null },
  { re: /^JASDF/i, operator: "other", type: null },
  { re: /^ROKAF/i, operator: "other", type: null },
  { re: /^KAF\d/i, operator: "other", type: null },
  { re: /^RAAF\d/i, operator: "other", type: null },
  { re: /^AUSSIE\d/i, operator: "other", type: null },
  { re: /^CANFORCE/i, operator: "other", type: "transport" },
  { re: /^CFC\d/i, operator: "other", type: null },
];

// ICAO type-code → aircraft type (adsb.lol `t` field)
function typeFromCode(code: string): TypeKey {
  const t = code.toUpperCase();
  if (/^(KC|K3|K35|KC10|KC46|KJ|A33|MRTT)/.test(t)) return "tanker";
  if (/^E[3-7]|^A50|^SRK|AWACS/.test(t)) return "awacs";
  if (/^(RC|U2|SR7|EP3|EQ)/.test(t)) return "reconnaissance";
  if (/^(MQ|RQ|GA|SI|CHG|HU)/.test(t)) return "drone";
  if (/^(P8|P3|ATL2|IL38|XP)/.test(t)) return "patrol";
  if (/^[BF]\d|^B1|^B2|^B52|^TU|^H6K/.test(t)) return "bomber";
  if (/^F\d|^F1|^F2|^F3|^F4|^F5|^M2K|^M3K|^EF2|^JAS|^JF|^SU|^MI[GK]/.test(t)) return "fighter";
  if (/^C\d|^(A40|A4|IL76|AN7|CN23|AT7|A30|KJ)/.test(t)) return "transport";
  if (/^(H6[05]|H64|H53|H47|H46|AW|AS5|EC|MI8|MI26|MH|S70|UH)/.test(t)) return "helicopter";
  if (/^(GV|GLF|B7|^E5|A319CJ|A33|B75|C32)/.test(t)) return "vip";
  return "unknown";
}

export interface ClassifiedFlight {
  operator: OperatorKey;
  operatorCountry: string;
  aircraftType: TypeKey;
  confidence: "high" | "medium" | "low";
}

export function classifyAircraft(callsign: string, typeCode?: string): ClassifiedFlight {
  const cs = callsign.trim();
  for (const p of CALLSIGN_PATTERNS) {
    if (p.re.test(cs)) {
      const fromCode = typeCode ? typeFromCode(typeCode) : "unknown";
      const aircraftType = p.type ?? (fromCode !== "unknown" ? fromCode : "unknown");
      return {
        operator: p.operator,
        operatorCountry: OPERATOR_COUNTRY[p.operator],
        aircraftType,
        confidence: "high",
      };
    }
  }
  const fromCode = typeCode ? typeFromCode(typeCode) : "unknown";
  return {
    operator: "other",
    operatorCountry: "Unknown",
    aircraftType: fromCode,
    confidence: fromCode !== "unknown" ? "medium" : "low",
  };
}

export {
  OPERATOR_ENUM,
  TYPE_ENUM,
  OPERATOR_COUNTRY,
};
