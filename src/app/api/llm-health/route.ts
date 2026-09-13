/**
 * LLM health — consumed by the LlmStatusIndicator (green/red dot).
 * Shape: { available, providers: [{name, url, available}], checkedAt }
 */

import { getZai } from "@/lib/wm-backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let lastCheck = { at: 0, ok: false };

export async function GET(): Promise<Response> {
  if (Date.now() - lastCheck.at < 60_000) {
    return serve(lastCheck.ok);
  }
  try {
    await getZai();
    lastCheck = { at: Date.now(), ok: true };
  } catch {
    lastCheck = { at: Date.now(), ok: false };
  }
  return serve(lastCheck.ok);
}

function serve(ok: boolean): Response {
  return Response.json(
    {
      available: ok,
      providers: [{ name: "zai-glm", url: "z-ai-web-dev-sdk", available: ok }],
      checkedAt: Date.now(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
