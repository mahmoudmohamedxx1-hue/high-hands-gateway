/**
 * Product catalog — mirrors the shape of the Vercel edge function:
 * { product, currency, plans, capabilities, tiers, fetchedAt, cachedUntil }
 * Data comes from the worldmonitor build's product-facts.json.
 */

import { readFile } from "fs/promises";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FACTS_PATH = "/home/z/worldmonitor/dist/product-facts.json";
let cached: { at: number; body: Record<string, unknown> } | null = null;

export async function GET(): Promise<Response> {
  try {
    if (!cached || Date.now() - cached.at > 10 * 60_000) {
      const raw = await readFile(FACTS_PATH, "utf8");
      const facts = JSON.parse(raw) as Record<string, unknown>;
      cached = {
        at: Date.now(),
        body: {
          product: facts.product ?? {},
          currency: facts.currency ?? "USD",
          plans: facts.plans ?? [],
          capabilities: facts.capabilities ?? {},
          tiers: ["free", "pro", "pro_business", "api_starter", "api_business", "enterprise"],
          fetchedAt: new Date().toISOString(),
          cachedUntil: new Date(Date.now() + 10 * 60_000).toISOString(),
        },
      };
    }
    return Response.json(cached.body, { headers: { "cache-control": "public, max-age=300" } });
  } catch (error) {
    console.error("[product-catalog] failed:", error);
    return Response.json(
      {
        product: { name: "World Monitor" },
        currency: "USD",
        plans: [],
        capabilities: {},
        tiers: [],
        fetchedAt: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
