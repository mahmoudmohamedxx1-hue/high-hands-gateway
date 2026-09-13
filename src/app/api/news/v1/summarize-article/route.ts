/**
 * Summarize / translate articles — the ✨ AI button on news panels.
 *
 * Implements the SummarizeArticle RPC wire contract used by
 * NewsServiceClient (Connect-style JSON POST → JSON response):
 *
 * request:  { provider, headlines[], mode, geoContext, variant, lang, systemAppend, bodies[] }
 * response: { summary, model, provider, tokens, fallback, error, errorType, status, statusDetail }
 *
 * mode 'brief'     → concise intelligence brief of the headlines
 * mode 'translate' → translate headlines[0] into language `variant`
 */

import { chatComplete, sha1 } from "@/lib/wm-backend";
import { summaryCache, SUMMARY_TTL_MS } from "@/lib/wm-summary-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SummarizeRequest {
  provider?: string;
  headlines?: string[];
  mode?: string;
  geoContext?: string;
  variant?: string;
  lang?: string;
  systemAppend?: string;
  bodies?: string[];
}

function ok(summary: string, model: string, tokens: number) {
  return {
    summary,
    model,
    provider: "zai",
    tokens,
    fallback: false,
    error: "",
    errorType: "",
    status: "SUMMARIZE_STATUS_SUCCESS",
    statusDetail: "",
  };
}

function skipped(reason: string) {
  return {
    summary: "",
    model: "",
    provider: "zai",
    tokens: 0,
    fallback: true,
    error: reason,
    errorType: "",
    status: "SUMMARIZE_STATUS_SKIPPED",
    statusDetail: reason,
  };
}

export async function POST(request: Request): Promise<Response> {
  const req = (await request.json().catch(() => ({}))) as SummarizeRequest;
  const headlines = Array.isArray(req.headlines)
    ? req.headlines.filter((h) => typeof h === "string").slice(0, 40).map((h) => h.slice(0, 300))
    : [];
  const bodies = Array.isArray(req.bodies)
    ? req.bodies.filter((b) => typeof b === "string").slice(0, 40).map((b) => b.slice(0, 400))
    : [];
  const mode = String(req.mode ?? "brief");
  const lang = String(req.lang ?? "en");
  const geo = String(req.geoContext ?? "").slice(0, 80);
  const systemAppend = String(req.systemAppend ?? "").slice(0, 400);

  if (headlines.length === 0) {
    return Response.json(skipped("no headlines"));
  }

  const cacheKey = sha1(JSON.stringify({ mode, lang, geo, headlines, bodies, systemAppend }));
  const cached = summaryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SUMMARY_TTL_MS) {
    return Response.json(
      { ...ok(cached.summary, cached.model, Math.ceil(cached.summary.length / 4)), status: "SUMMARIZE_STATUS_CACHED" },
      { headers: { "cache-control": "no-store" } },
    );
  }

  try {
    let prompt: string;
    let system: string;

    if (mode === "translate") {
      const target = String(req.variant ?? "en").slice(0, 8);
      system = `You are a precise translator for a global-intelligence dashboard. Translate the user's text into the language with ISO code "${target}". Output ONLY the translation, nothing else.`;
      prompt = headlines.join("\n");
    } else {
      system = `You are the AI summarizer inside World Monitor, a real-time global intelligence dashboard. Write a tight intelligence brief (2-4 sentences, max ~90 words) of the supplied headlines for a professional analyst.${geo ? ` Geographic focus: ${geo}.` : ""}${systemAppend ? ` Additional instruction: ${systemAppend}` : ""} Identify the single most consequential thread, note corroboration across sources when present, and flag uncertainty. Output ONLY the brief.`;
      const withBodies = headlines.map((h, i) => {
        const body = bodies[i]?.trim();
        return body ? `- ${h}\n  Context: ${body}` : `- ${h}`;
      });
      prompt = withBodies.join("\n");
    }

    const reply = await chatComplete(
      [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      1200,
    );
    const summary = reply.trim();
    if (!summary) {
      return Response.json(skipped("empty model response"));
    }

    const model = "glm-4.6";
    summaryCache.set(cacheKey, { at: Date.now(), summary, model });
    // Expose under the client-computed key too when provided (best effort).
    const clientKey = new URL(request.url).searchParams.get("cache_key");
    if (clientKey) summaryCache.set(clientKey, { at: Date.now(), summary, model });

    return Response.json(ok(summary, model, Math.ceil(summary.length / 4)), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("[summarize-article] failed:", error);
    return Response.json(
      {
        summary: "",
        model: "",
        provider: "zai",
        tokens: 0,
        fallback: true,
        error: "zai backend error",
        errorType: "provider",
        status: "SUMMARIZE_STATUS_ERROR",
        statusDetail: String(error instanceof Error ? error.message : error),
      },
      { status: 200 },
    );
  }
}
