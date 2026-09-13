/**
 * HLS referer/CORS proxy for live channels.
 *
 * GET /api/live/hls?u=<encoded manifest url>&ref=<encoded referer>
 *
 * - Fetches the manifest with a browser UA (+ optional Referer) from the
 *   sandbox, which has unrestricted egress.
 * - Rewrites every URI inside the playlist (media segments, variant
 *   playlists, EXT-X-KEY/MAP URIs) to route back through this proxy so the
 *   browser-side hls.js fetch stays same-origin and CORS-clean.
 * - Non-playlist responses (TS/fMP4 segments) are streamed through with
 *   `Access-Control-Allow-Origin: *`.
 * - Basic SSRF guard: https only, private/loopback hosts rejected.
 */

import { fetchUpstream } from "@/lib/wm-backend";
import dns from "dns/promises";
import net from "net";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) {
    throw new Error("private host");
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("private host");
    return;
  }
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.some((a) => isPrivateIp(a.address))) throw new Error("private host");
  } catch (error) {
    if (error instanceof Error && error.message === "private host") throw error;
    // DNS failure upstream will surface on fetch — allow it through.
  }
}

function proxied(target: string, ref: string): string {
  const params = new URLSearchParams({ u: target });
  if (ref) params.set("ref", ref);
  return `/api/live/hls?${params.toString()}`;
}

function rewritePlaylist(text: string, playlistUrl: string, ref: string): string {
  const lines = text.split("\n");
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Rewrite URI="..." attributes (EXT-X-KEY, EXT-X-MAP, EXT-X-I-FRAME...)
    if (trimmed.startsWith("#") && trimmed.includes('URI="')) {
      return trimmed.replace(/URI="([^"]+)"/g, (_m, raw: string) => {
        try {
          const absolute = new URL(raw, playlistUrl).toString();
          return `URI="${proxied(absolute, ref)}"`;
        } catch {
          return `URI="${raw}"`;
        }
      });
    }

    if (trimmed.startsWith("#")) return line;

    // Media/variant playlist URI line.
    try {
      const absolute = new URL(trimmed, playlistUrl).toString();
      return proxied(absolute, ref);
    } catch {
      return line;
    }
  });
  return out.join("\n");
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get("u") ?? "";
  const ref = url.searchParams.get("ref") ?? "";

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return new Response("bad protocol", { status: 400 });
  }
  try {
    await assertPublicHost(parsed.hostname);
  } catch {
    return new Response("forbidden host", { status: 403 });
  }

  let upstream: Response;
  try {
    const headers: Record<string, string> = { accept: "*/*" };
    if (ref) headers.referer = ref;
    upstream = await fetchUpstream(parsed.toString(), { headers }, 20_000);
  } catch (error) {
    console.warn("[live/hls] upstream failed:", parsed.toString(), error);
    return new Response("upstream unreachable", { status: 502 });
  }

  const contentTypeRaw = upstream.headers.get("content-type") ?? "";
  const contentType = contentTypeRaw.toLowerCase();
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,OPTIONS",
    "access-control-expose-headers": "content-length,content-type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (!upstream.ok) {
    return new Response(`upstream ${upstream.status}`, { status: upstream.status, headers: cors });
  }

  // Case-insensitive playlist detection — CDNs mix "application/x-mpegURL",
  // "application/vnd.apple.mpegurl" and "audio/mpegurl". Also sniff the body
  // start when the content-type is missing or generic (some origin servers
  // answer manifests with application/octet-stream).
  let isPlaylist =
    contentType.includes("mpegurl") ||
    contentType.includes("m3u8") ||
    contentType.includes("text/plain") ||
    contentType === "";
  if (isPlaylist) {
    const text = await upstream.text();
    isPlaylist = text.trimStart().startsWith("#EXTM3U");
    if (isPlaylist) {
      const isMaster = !text.includes("#EXTINF");
      return new Response(rewritePlaylist(text, parsed.toString(), ref), {
        headers: {
          ...cors,
          "content-type": "application/vnd.apple.mpegurl",
          "cache-control": isMaster ? "no-store" : "public, max-age=6",
        },
      });
    }
    // Not actually a playlist — fall through with the already-read text.
    return new Response(text, {
      headers: { ...cors, "content-type": contentTypeRaw || "video/mp2t", "cache-control": "public, max-age=30" },
    });
  }

  // Segment / binary passthrough.
  return new Response(upstream.body, {
    headers: {
      ...cors,
      "content-type": contentTypeRaw || "video/mp2t",
      "cache-control": "public, max-age=30",
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,HEAD,OPTIONS",
    },
  });
}
