/**
 * Widget-agent — the premium "create widget with AI" relay.
 *
 * The production edge handler injects server keys and proxies the Railway
 * relay; that relay is key-gated and unreachable for anonymous sandbox
 * callers. This route reimplements both sides with z-ai:
 *
 *   GET  /api/widget-agent  → health { ok, agentEnabled, ... proKeyConfigured }
 *   POST /api/widget-agent  → SSE: {type:'tool_call'} → {type:'html_complete'}
 *                             → {type:'done', title}
 */

import { chatComplete, topDigestStories, getDigest } from "@/lib/wm-backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      ok: true,
      agentEnabled: true,
      widgetKeyConfigured: true,
      proKeyConfigured: true,
      anthropicConfigured: true,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

function extractTitle(prompt: string, html: string): string {
  const titleTag = html.match(/<title>([^<]{2,60})<\/title>/i);
  if (titleTag?.[1]) return titleTag[1].trim();
  const cleaned = prompt.replace(/^(create|make|build|generate|show)\s+(me\s+)?(a|an|the)?\s*/i, "").trim();
  return (cleaned.slice(0, 48) || "Custom Widget").replace(/\b\w/g, (c) => c.toUpperCase());
}

function stripFences(text: string): string {
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const raw = (fence?.[1] ?? text).trim();
  const htmlStart = raw.search(/<!doctype html|<html[\s>]/i);
  return htmlStart >= 0 ? raw.slice(htmlStart) : raw;
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    mode?: string;
    tier?: string;
    currentHtml?: string;
    conversationHistory?: Array<{ role?: string; content?: string }>;
  };
  const prompt = String(body.prompt ?? "").slice(0, 2000);
  if (!prompt) {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }

  const history = (Array.isArray(body.conversationHistory) ? body.conversationHistory : [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${String(m.content ?? "").slice(0, 400)}`)
    .join("\n");

  const digest = await getDigest();
  const stories = topDigestStories(digest, 6);
  const context = stories.map((s) => `- [${s.category}] ${s.title} (${s.source})`).join("\n");

  const system = `You are the World Monitor widget generator. You turn a natural-language request into a COMPLETE, self-contained HTML widget.

Hard requirements:
- Output ONE HTML document starting with <!DOCTYPE html>: inline <style> and <script>, zero external dependencies, no external requests except same-origin "/api/..." fetches.
- Dark analytics aesthetic: background #101318, panel #161a21, 1px #2a3038 borders, accent #e8b341 (or #e5484d for alerts), 11-12px monospace/system-ui typography, generous padding, subtle border-radius.
- Make it genuinely useful: real interactivity (sorting, filters, live clock, canvas/SVG chart drawn from inline data), never a lorem stub.
- If the request relates to world news/intelligence, ground the widget in the live stories listed below (render them, don't invent).
- Keep total output under ~9KB of HTML. No explanations, no markdown fences — raw HTML only.

Live dashboard stories for grounding:
${context || "(none available)"}`;

  const user = body.currentHtml
    ? `Existing widget HTML:\n${body.currentHtml.slice(0, 4000)}\n\nModify it per this request: ${prompt}`
    : `${history ? history + "\n\n" : ""}Request: ${prompt}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      try {
        send({ type: "tool_call", endpoint: "news-digest" });
        const html = stripFences(
          await chatComplete(
            [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            12_000,
          ),
        );
        if (!/<[a-z!]/i.test(html)) throw new Error("model returned non-HTML");
        send({ type: "html_complete", html });
        send({ type: "done", title: extractTitle(prompt, html) });
      } catch (error) {
        console.error("[widget-agent] generation failed:", error);
        send({ type: "error", message: "Widget generation failed — try a simpler prompt." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
