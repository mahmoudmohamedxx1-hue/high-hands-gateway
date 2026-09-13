import { NextResponse, type NextRequest } from "next/server";

/**
 * Reverse proxy that stitches the World Monitor production stack together
 * behind the sandbox's single exposed port (3000, owned by this Next.js dev
 * server):
 *
 *   /api/*, /rss/*, /widget-agent/*  →  Vite DEV server   (http://localhost:3001)
 *       The dev server hosts the runtime data layer: the sebuf RPC router,
 *       rss-proxy, polymarket, youtube-live and gpsjam middlewares plus the
 *       external-API dev proxies (USGS, Yahoo, FRED, BBC/Guardian RSS, ...).
 *       These respond fast — no module graph involved.
 *
 *   everything else                 →  Vite PREVIEW server (http://localhost:3002)
 *       Serves the production bundle (dist/): a handful of bundled, hashed
 *       asset files instead of the ~4000 on-demand module requests a Vite
 *       dev boot needs, so the dashboard paints in seconds.
 *
 * Why a manual fetch instead of `next.config.ts` `rewrites()` or
 * `NextResponse.rewrite`?
 *  - External rewrites in Next dev DROP the request's query string.
 *  - When they do forward it, Next normalizes bare params (`?worker` ->
 *    `?worker=`), and upstream tools keying off the raw query break.
 *
 * So this proxy fetches upstream itself with a hand-built URL and streams the
 * response back. Empty-valued query params are re-serialized as bare keys
 * (safe: URLSearchParams parses `?k` and `?k=` identically).
 */

// Vite dev server (API middlewares + dev proxies).
const DEV_ORIGIN = process.env.WORLD_MONITOR_ORIGIN ?? "http://localhost:3001";
// Vite preview server (static production bundle from dist/).
const STATIC_ORIGIN = process.env.WORLD_MONITOR_STATIC_ORIGIN ?? "http://localhost:3002";

/**
 * Paths owned by THIS Next.js app's route handlers (see src/app/api/**).
 *
 * They either need z-ai-web-dev-sdk (AI endpoints), fix endpoints the Vite
 * layer cannot serve (unversioned /api paths answer with module source
 * instead of JSON), or add caching the upstream lacks. Returning
 * NextResponse.next() lets the request reach the app router.
 */
const SANDBOX_API_PATHS = [
  "/api/news/v1/list-feed-digest",
  "/api/news/v1/summarize-article",
  "/api/news/v1/summarize-article-cache",
  "/api/chat-analyst",
  "/api/bootstrap",
  "/api/llm-health",
  "/api/product-catalog",
  "/api/youtube/live",
  "/api/live/hls",
  "/api/sanctions/v1/list-sanctions-pressure",
  "/api/health",
  "/api/correlation-runtime-mode",
  "/api/telegram-feed",
  "/api/x-feed",
  "/api/widget-agent",
  // Market/commodity/sector/crypto quotes (Yahoo v8 / CoinGecko, keyless)
  "/api/market/v1/list-market-quotes",
  "/api/market/v1/list-commodity-quotes",
  "/api/market/v1/get-sector-summary",
  "/api/market/v1/list-crypto-quotes",
  // Economic (energy prices, ECB-style FX rates)
  "/api/economic/v1/get-energy-prices",
  "/api/economic/v1/get-ecb-fx-rates",
  // Prediction markets (Polymarket Gamma, keyless)
  "/api/prediction/v1/list-prediction-markets",
  // ADS-B aircraft (adsb.lol, keyless)
  "/api/military/v1/list-military-flights",
  "/api/aviation/v1/track-aircraft",
  // Webcams (curated real YouTube live streams, keyless)
  "/api/webcam/v1/list-webcams",
  "/api/webcam/v1/get-webcam-image",
];

function isSandboxApi(pathname: string): boolean {
  return SANDBOX_API_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Paths owned by the dev server's API layer. */
function isDevRouted(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/rss" ||
    pathname.startsWith("/rss/") ||
    pathname === "/widget-agent" ||
    pathname.startsWith("/widget-agent/")
  );
}

// Headers we never forward upstream (hop-by-hop / connection-scoped).
const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authorization",
  "proxy-connection",
  "content-length",
]);

// Headers we never forward downstream (undici handles decompression and
// framing; forwarding these would corrupt the streamed response).
const STRIP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

function rawSearch(request: NextRequest): string {
  const params = [...request.nextUrl.searchParams];
  if (params.length === 0) return "";
  const parts = params.map(([key, value]) => (value === "" ? key : `${key}=${value}`));
  return `?${parts.join("&")}`;
}

function forwardableHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("accept-encoding", "identity"); // keep responses uncompressed
  return headers;
}

export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Sandbox-owned API paths are handled by this app's own route handlers.
  if (isSandboxApi(pathname)) {
    return NextResponse.next();
  }

  const origin = isDevRouted(pathname) ? DEV_ORIGIN : STATIC_ORIGIN;

  // The dashboard shell lives at the bundle root; serve it at the site root.
  const path = !isDevRouted(pathname) && pathname === "/" ? "/index.html" : pathname;
  const target = `${origin}${path}${rawSearch(request)}`;

  const hasBody = !(method === "GET" || method === "HEAD");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method,
      headers: forwardableHeaders(request),
      body: hasBody ? request.body : undefined,
      redirect: "manual",
      // Required by fetch when sending a stream body.
      ...(hasBody ? ({ duplex: "half" } as RequestInit) : {}),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[wm-proxy] upstream fetch failed:", target, error);
    // Best-effort: spawn the detached stack recovery (throttled + lockfile
    // guarded inside wm-selfheal). Dynamic import keeps the proxy's happy
    // path free of node-only modules.
    try {
      const { triggerWmRestore } = await import("./lib/wm-selfheal");
      void triggerWmRestore(`proxy-${isDevRouted(pathname) ? "api" : "static"}`);
    } catch {
      // healing unavailable — still serve the recovery page below
    }
    const which = isDevRouted(pathname) ? "API (dev) server on :3001" : "static (preview) server on :3002";
    return new NextResponse(recoveryPage(which), {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "retry-after": "15",
        "cache-control": "no-store",
      },
    });
  }

  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

// Proxy everything except Next.js' own runtime assets.
export const config = {
  matcher: ["/((?!_next/).*)"],
};

/** Friendly auto-reloading page shown while the stack recovers itself. */
function recoveryPage(which: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>HIGH-HANDS — recovering…</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0a0e14; color: #d7dde6; font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .card {
    max-width: 460px; margin: 20px; padding: 28px 30px; text-align: center;
    background: #11161f; border: 1px solid #232c3a; border-radius: 14px;
  }
  .brand { font-size: 22px; font-weight: 700; letter-spacing: 0.08em; color: #f2f6fb; }
  .dot { display: inline-block; width: 9px; height: 9px; margin-right: 10px; border-radius: 50%;
    background: #4ade80; animation: pulse 1.4s ease-in-out infinite; vertical-align: 2px; }
  @keyframes pulse { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
  p { margin: 14px 0 0; color: #9aa7b5; }
  .sub { font-size: 12.5px; color: #617082; margin-top: 18px; }
</style>
</head>
<body>
  <main class="card">
    <div class="brand"><span class="dot"></span>HIGH-HANDS</div>
    <p>The dashboard backend is restarting itself — this happens after a
    sandbox maintenance reset and takes up to a few minutes.</p>
    <p class="sub">This page reconnects automatically every 10 seconds.<br>
    (${which.replace(/.*on /, "upstream: ")})</p>
  </main>
</body>
</html>`;
}
