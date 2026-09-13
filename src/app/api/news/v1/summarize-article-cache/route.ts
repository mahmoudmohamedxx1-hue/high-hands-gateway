/**
 * Summarize cache lookup — always a valid SummarizeArticleResponse JSON so the
 * client never trips over a parse error. Misses return an empty payload, which
 * makes the client proceed to the provider chain (our summarize-article route).
 */

import { summaryCache, SUMMARY_TTL_MS } from "@/lib/wm-summary-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const key = new URL(request.url).searchParams.get("cache_key") ?? "";
  const hit = key ? summaryCache.get(key) : undefined;

  if (hit && Date.now() - hit.at < SUMMARY_TTL_MS) {
    return Response.json(
      {
        summary: hit.summary,
        model: hit.model,
        provider: "zai",
        tokens: Math.ceil(hit.summary.length / 4),
        fallback: false,
        error: "",
        errorType: "",
        status: "SUMMARIZE_STATUS_CACHED",
        statusDetail: "",
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json(
    {
      summary: "",
      model: "",
      provider: "",
      tokens: 0,
      fallback: true,
      error: "",
      errorType: "",
      status: "SUMMARIZE_STATUS_UNSPECIFIED",
      statusDetail: "",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
