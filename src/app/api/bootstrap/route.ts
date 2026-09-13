/**
 * Bootstrap endpoint — replaces the Vercel edge function that the Vite dev
 * server cannot serve (it answers unversioned /api/* paths with module source).
 *
 * GET /api/bootstrap?keys=a,b,c  →  { data: { <key>: <payload> } }
 *
 * Implemented keys:
 *  - weatherAlerts    → live NWS active alerts (the map Weather Alerts layer)
 *  - canadaAlerts     → public-safety alert snapshot (Canada Alerts layer)
 *  - sanctionsPressure→ sanctions-pressure snapshot (Sanctions panel + map layer)
 *  - insights         → AI world brief (z-ai) grounded on the live news digest
 * Unimplemented keys are omitted — clients already treat them as "no data".
 */

import { fetchUpstream, getDigest, topDigestStories, chatComplete } from "@/lib/wm-backend";
import { buildSanctionsPayload } from "@/lib/wm-sanctions-data";
import { CANADA_ALERTS } from "@/lib/wm-canada-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── caches ──────────────────────────────────────────────────────────────────

const weatherCache = { at: 0, alerts: [] as AlertPayload[] };
const canadaCache = { at: 0, alerts: [] as CanadaPayload[] };
const insightsCache = { at: 0, payload: null as InsightsPayload | null };

// ── weatherAlerts (NWS) ─────────────────────────────────────────────────────

interface AlertPayload {
  id: string;
  event: string;
  severity: string;
  headline: string;
  description: string;
  areaDesc: string;
  onset: string;
  expires: string;
  coordinates: [number, number][];
  centroid?: [number, number];
  countryCode?: string;
  source?: string;
  geometryPrecision?: "polygon" | "point" | "country";
}

function nwsSeverity(raw: string | undefined): string {
  const s = String(raw ?? "").toLowerCase();
  if (s === "extreme") return "Extreme";
  if (s === "severe") return "Severe";
  if (s === "moderate") return "Moderate";
  if (s === "minor") return "Minor";
  return "Unknown";
}

function geometryToCoords(geometry: { type?: string; coordinates?: unknown } | null): {
  coordinates: [number, number][];
  centroid?: [number, number];
  precision: "polygon" | "point";
} {
  if (!geometry?.coordinates) {
    return { coordinates: [], precision: "point" };
  }
  if (geometry.type === "Point") {
    const [lon, lat] = geometry.coordinates as [number, number];
    return { coordinates: [[lon, lat]], centroid: [lon, lat], precision: "point" };
  }
  if (geometry.type === "Polygon") {
    const ring = (geometry.coordinates as number[][][])[0] ?? [];
    const coords = ring.map(([lon, lat]) => [lon, lat] as [number, number]);
    const centroid = coords.length
      ? [
          coords.reduce((s, c) => s + c[0], 0) / coords.length,
          coords.reduce((s, c) => s + c[1], 0) / coords.length,
        ] as [number, number]
      : undefined;
    return { coordinates: coords, centroid, precision: "polygon" };
  }
  return { coordinates: [], precision: "point" };
}

async function fetchWeatherAlerts(): Promise<AlertPayload[]> {
  if (Date.now() - weatherCache.at < 2 * 60_000 && weatherCache.alerts.length) return weatherCache.alerts;
  try {
    // NOTE: api.weather.gov rejects `limit`/`status`/`message_type` params on
    // this endpoint (400 "not recognized") — fetch the full active set and
    // filter locally.
    const res = await fetchUpstream("https://api.weather.gov/alerts/active", {
      headers: { accept: "application/geo+json", "user-agent": "worldmonitor-sandbox/1.0 (sandbox preview)" },
    }, 20_000);
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { features?: Array<{ properties?: Record<string, unknown>; geometry?: unknown }> };
    const alerts: AlertPayload[] = (json.features ?? [])
      .filter((f) => {
        const p = f.properties ?? {};
        return (
          String(p.status ?? "Actual") === "Actual" &&
          String(p.severity ?? "") !== "Unknown" &&
          !/test/i.test(String(p.event ?? ""))
        );
      })
      .slice(0, 250)
      .map((f, i) => {
        const p = f.properties ?? {};
        const { coordinates, centroid, precision } = geometryToCoords(f.geometry as never);
        return {
          id: String(p.id ?? `nws-${i}`),
          event: String(p.event ?? "Weather Alert"),
          severity: nwsSeverity(p.severity as string | undefined),
          headline: String(p.headline ?? p.event ?? "Weather Alert"),
          description: String(p.description ?? "").slice(0, 1200),
          areaDesc: String(p.areaDesc ?? ""),
          onset: String(p.onset ?? p.sent ?? new Date().toISOString()),
          expires: String(p.expires ?? new Date(Date.now() + 6 * 3600_000).toISOString()),
          coordinates,
          centroid,
          countryCode: "US",
          source: "NWS",
          geometryPrecision: precision,
        };
      });
    weatherCache.at = Date.now();
    weatherCache.alerts = alerts;
  } catch (error) {
    console.warn("[bootstrap] NWS fetch failed:", error);
    if (!weatherCache.alerts.length) return [];
    return weatherCache.alerts;
  }
  return weatherCache.alerts;
}

// ── canadaAlerts (snapshot — weather.gc.ca unreachable from sandbox) ────────

function fetchCanadaAlerts(): unknown[] {
  return CANADA_ALERTS as unknown[];
}

// ── insights (AI world brief over the live digest) ──────────────────────────

interface InsightsPayload {
  worldBrief: string;
  briefStoryLines?: Array<{ n: number; text: string }>;
  worldBriefSources?: Array<{ title: string; source: string; url: string }>;
  briefProvider: string;
  status: "ok" | "degraded";
  topStories: Array<Record<string, unknown>>;
  generatedAt: string;
  clusterCount: number;
  multiSourceCount: number;
  fastMovingCount: number;
}

const THREAT_BY_IMPORTANCE = (score: number): string =>
  score >= 90 ? "CRITICAL" : score >= 75 ? "HIGH" : score >= 55 ? "ELEVATED" : "MODERATE";

async function buildInsights(): Promise<InsightsPayload | null> {
  if (insightsCache.payload && Date.now() - insightsCache.at < 10 * 60_000) return insightsCache.payload;

  const digest = await getDigest();
  const stories = topDigestStories(digest, 10);
  if (!stories.length) return null;

  const context = stories.map((s, i) => `${i + 1}. [${s.category}] ${s.title} (${s.source})`).join("\n");

  let brief = "";
  try {
    brief = await chatComplete(
      [
        {
          role: "system",
          content:
            "You are World Monitor's duty analyst. Write today's WORLD BRIEF: 4-6 tight sentences for a professional situational-awareness dashboard, in plain text (no markdown). Cover the 2-3 most consequential threads, note cross-regional links, and end with one sentence on what to watch next. Ground it strictly in the supplied stories.",
        },
        { role: "user", content: context },
      ],
      1400,
    );
  } catch (error) {
    console.warn("[bootstrap] insights LLM failed:", error);
  }

  const payload: InsightsPayload = {
    worldBrief: brief.trim() || stories.slice(0, 3).map((s) => s.title).join(" · "),
    briefStoryLines: stories.slice(0, 5).map((s, i) => ({ n: i + 1, text: s.title.slice(0, 200) })),
    worldBriefSources: stories.slice(0, 6).map((s) => ({
      title: s.title.slice(0, 160),
      source: s.source.slice(0, 80),
      url: s.link,
    })),
    briefProvider: "zai",
    status: brief.trim() ? "ok" : "degraded",
    topStories: stories.map((s) => ({
      primaryTitle: s.title.slice(0, 300),
      primarySource: s.source,
      primaryLink: s.link,
      pubDate: new Date(s.publishedAt || Date.now()).toISOString(),
      sourceCount: 1,
      uniqueSourceCount: 1,
      importanceScore: s.importance,
      credibilityScore: 72,
      velocity: { level: s.importance >= 75 ? "spiking" : "moving", sourcesPerHour: Math.max(1, Math.round(s.importance / 20)) },
      isAlert: s.importance >= 80,
      category: s.category,
      threatLevel: THREAT_BY_IMPORTANCE(s.importance),
      countryCode: null,
    })),
    generatedAt: new Date().toISOString(),
    clusterCount: stories.length,
    multiSourceCount: 0,
    fastMovingCount: stories.filter((s) => s.importance >= 75).length,
  };

  insightsCache.at = Date.now();
  insightsCache.payload = payload;
  return payload;
}

// ── handler ─────────────────────────────────────────────────────────────────

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const keys = (url.searchParams.get("keys") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  const data: Record<string, unknown> = {};

  await Promise.all(
    keys.map(async (key) => {
      switch (key) {
        case "weatherAlerts":
          data[key] = { alerts: await fetchWeatherAlerts() };
          break;
        case "canadaAlerts":
          data[key] = { alerts: fetchCanadaAlerts() };
          break;
        case "sanctionsPressure":
          data[key] = buildSanctionsPayload();
          break;
        case "insights":
          data[key] = await buildInsights();
          break;
        default:
          // Not implemented in the sandbox — omit, clients degrade gracefully.
          break;
      }
    }),
  );

  return Response.json({ data }, { headers: { "cache-control": "no-store" } });
}
