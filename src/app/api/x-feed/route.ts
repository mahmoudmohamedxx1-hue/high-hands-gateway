/**
 * X (Twitter) news-accounts feed.
 *
 * The upstream edge function requires WS_RELAY_URL (Railway relay with the
 * official X API bearer) which a zero-env sandbox cannot provide. Return the
 * same wire shape in an explicitly-degraded state so the X Intel panel renders
 * its empty state instead of a parse error.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      source: "x",
      earlySignal: false,
      enabled: true,
      count: 0,
      updatedAt: null,
      lastHealthyAt: null,
      degraded: true,
      coverage: { expected: 0, polled: 0, failed: 0, attempted: 0, complete: true },
      items: [],
    },
    { headers: { "cache-control": "no-store" } },
  );
}
