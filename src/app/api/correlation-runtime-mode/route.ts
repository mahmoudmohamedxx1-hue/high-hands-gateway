/**
 * Correlation clustering control-plane — returns the legacy mode so the
 * dashboard's correlation runtime resolves cleanly instead of parsing the
 * module source the Vite dev layer would otherwise answer with.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json(
    { mode: "legacy", updatedAt: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
