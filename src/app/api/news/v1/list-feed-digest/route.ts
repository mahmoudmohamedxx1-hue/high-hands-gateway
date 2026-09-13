/**
 * News feed digest — cached, fast.
 *
 * The upstream Vite dev aggregator fans out to ~90 RSS publishers and takes
 * ~10s cold, which exceeds the app's client timeout. This route keeps a
 * 3-minute in-memory snapshot (stale-while-revalidate) so the dashboard always
 * paints its feed instantly.
 */

import { getDigest } from "@/lib/wm-backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const variant = url.searchParams.get("variant") ?? "full";
  const lang = url.searchParams.get("lang") ?? "en";
  // Cache key is normalized (variant+lang only) — callers append flags like
  // `&public=1` that do not change the payload, and distinct keys would make
  // every flagged call re-hit the ~10s upstream aggregation.
  const search = `variant=${encodeURIComponent(variant)}&lang=${encodeURIComponent(lang)}`;

  const digest = await getDigest(search);
  if (!digest) {
    return Response.json(
      { error: "digest unavailable" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json(digest, {
    headers: { "cache-control": "public, max-age=60" },
  });
}
