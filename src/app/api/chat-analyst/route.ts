/**
 * WM Analyst — premium AI chat analyst (SSE).
 *
 * Replaces the Vercel/Railway handler. Streams `data: {json}` events that
 * ChatAnalystPanel.readStream() understands:
 *   {delta: string}  — append text
 *   {done: true}     — finish
 *   {error: string}  — abort with message
 *
 * Grounds every answer in the live news digest (top stories) so the analyst
 * genuinely "knows" what is happening on the dashboard.
 */

import { chatComplete, streamChat, topDigestStories, getDigest, type ChatMessage } from "@/lib/wm-backend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DOMAIN_FOCUS: Record<string, string> = {
  general: " geopolitical and situational awareness",
  markets: " financial markets, commodities and macroeconomics",
  tech: " technology, AI and cybersecurity",
  energy: " energy markets, infrastructure and supply chains",
  conflict: " armed conflict, military posture and escalation risk",
};

function sse(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    history?: Array<{ role?: string; content?: string }>;
    query?: string;
    domainFocus?: string;
  };

  const query = String(body.query ?? "").trim().slice(0, 500);
  if (!query) {
    return Response.json({ error: "query required" }, { status: 400 });
  }

  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-12)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, 800) }));

  const focus = DOMAIN_FOCUS[String(body.domainFocus ?? "general")] ?? DOMAIN_FOCUS.general;

  // Live context from the cached news digest.
  const digest = await getDigest();
  const stories = topDigestStories(digest, 15);
  const context = stories
    .map((s, i) => `${i + 1}. [${s.category}] ${s.title} (${s.source})`)
    .join("\n");

  const system = `You are WM Analyst, the senior intelligence analyst inside the World Monitor global situational-awareness dashboard. Your specialty:${focus}.

You are given the top live stories currently on the dashboard:
${context || "(no live stories available right now)"}

Rules:
- Ground every answer in the live stories above when relevant, and say which story you are drawing on.
- Be concise and analytical: short paragraphs, bullet points when comparing, bold key judgements using **markdown**.
- Give measured, non-alarmist assessments. When something is speculative, label it clearly ("assessment:", "low confidence").
- If asked about something unrelated to global events, briefly answer, then steer back to situational awareness.
- Never invent specific casualty numbers, prices, or dates that are not in the provided stories.`;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: query },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(sse(payload));
      try {
        const full = await streamChat(messages, async (delta) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
        });
        if (!full.trim()) {
          send({ error: "empty response" });
        } else {
          send({ done: true });
        }
      } catch (error) {
        console.error("[chat-analyst] failed:", error);
        try {
          // Last-ditch non-streaming attempt
          const fallback = await chatComplete(messages);
          if (fallback.trim()) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: fallback })}\n\n`));
            send({ done: true });
          } else {
            send({ error: "analyst unavailable" });
          }
        } catch {
          send({ error: "analyst unavailable" });
        }
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
