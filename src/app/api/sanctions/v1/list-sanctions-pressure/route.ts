/**
 * Sanctions pressure RPC — Connect-style JSON POST.
 *
 * The upstream dev router has no handler for this path in the sandbox, so this
 * route answers with the snapshot dataset (see lib/wm-sanctions-data.ts).
 */

import { buildSanctionsPayload } from "@/lib/wm-sanctions-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  return Response.json(buildSanctionsPayload(), { headers: { "cache-control": "no-store" } });
}

export async function GET(): Promise<Response> {
  return Response.json(buildSanctionsPayload(), { headers: { "cache-control": "no-store" } });
}
