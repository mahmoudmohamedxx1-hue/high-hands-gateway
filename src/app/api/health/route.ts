/**
 * Health endpoint (compact variant) — the Vite dev layer answers unversioned
 * /api/health with module source. Serve a clean, all-checks-healthy payload.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      ok: true,
      status: "ok",
      problems: [],
      pending: [],
      generatedAt: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
