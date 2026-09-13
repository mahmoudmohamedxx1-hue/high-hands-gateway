/**
 * GET /api/webcam/v1/get-webcam-image?webcamId=yt:{videoId}
 *
 * Resolves a curated webcam's live thumbnail + player URLs (keyless,
 * YouTube-hosted). The map tooltip shows the thumbnail; click-through goes to
 * the live stream.
 */

import {
  parseWebcamId,
  embedUrlFor,
  watchUrlFor,
  thumbnailFor,
  SANDBOX_WEBCAMS,
} from "@/lib/wm-webcams";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const webcamId = (url.searchParams.get("webcamId") ?? "").trim();

  const videoId = parseWebcamId(webcamId);
  if (!videoId) {
    return Response.json({
      thumbnailUrl: "",
      playerUrl: "",
      title: "",
      windyUrl: "",
      lastUpdated: new Date().toISOString(),
      error: "unavailable",
    });
  }

  const entry = SANDBOX_WEBCAMS.find((cam) => cam.webcamId === webcamId);

  return Response.json(
    {
      thumbnailUrl: thumbnailFor(webcamId) ?? "",
      playerUrl: embedUrlFor(webcamId) ?? "",
      title: entry?.title ?? "Live webcam",
      windyUrl: watchUrlFor(webcamId) ?? "",
      lastUpdated: new Date().toISOString(),
      error: "",
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
