/**
 * GET /api/webcam/v1/list-webcams?zoom=&boundW=&boundS=&boundE=&boundN=
 *
 * Serves the curated real webcam catalog (keyless YouTube live streams).
 * Entries outside the requested bbox are filtered; a missing/invalid bbox
 * returns the full catalog. Clusters stay empty — the client layers render
 * leaves at low zoom fine.
 */

import { SANDBOX_WEBCAMS } from "@/lib/wm-webcams";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = {
    w: url.searchParams.get("boundW"),
    s: url.searchParams.get("boundS"),
    e: url.searchParams.get("boundE"),
    n: url.searchParams.get("boundN"),
  };
  // Only treat as a bbox when all four params are present AND numeric
  // (Number("") and Number(null) are 0 — a client omitting bounds must get
  // the full catalog, not the 0°x0° box).
  const nums = Object.values(raw).map((v) => (v == null || v.trim() === "" ? NaN : Number(v)));
  const [w, s, e, n] = nums;

  let webcams = SANDBOX_WEBCAMS;
  if (nums.every((v) => Number.isFinite(v))) {
    // Honor an antimeridian-crossing bbox if the client sends one.
    const lonOk = (lng: number) => (w <= e ? lng >= w && lng <= e : lng >= w || lng <= e);
    webcams = webcams.filter(
      (cam) => cam.lat >= s && cam.lat <= n && lonOk(cam.lng),
    );
  }

  return Response.json(
    {
      webcams: webcams.map(({ webcamId, title, lat, lng, category, country }) => ({
        webcamId,
        title,
        lat,
        lng,
        category,
        country,
      })),
      clusters: [],
      totalInView: webcams.length,
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
