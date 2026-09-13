/**
 * Curated real webcam catalog for the World Monitor sandbox.
 *
 * The upstream layer is Windy Webcams API v3 (key-gated, no key in this
 * sandbox). Instead, this catalog points each location at a REAL public
 * 24/7 live stream on YouTube, embedded by CHANNEL id:
 *
 *   https://www.youtube.com/embed/live_stream?channel=UC…
 *
 * Channel-based embeds resolve the channel's CURRENT live stream on every
 * request from the viewer's own IP — no server-side scraping, no stale
 * videoId fallbacks. (Video-id scraping from a datacenter IP returns
 * YouTube's bot-flagged recommendation junk, which is why the earlier
 * yt:{videoId} scheme kept rotting.)
 *
 * webcamId format `ch:{channelId}`; the legacy `yt:{videoId}` format is
 * still parsed for pinned-store entries saved before the switch.
 *
 * Channel ids verified via canonical link + og:title cross-check (Sep 2026).
 */

export interface SandboxWebcam {
  webcamId: string; // ch:{UC channel id}
  title: string;
  lat: number;
  lng: number;
  category: string;
  country: string;
  handle: string; // reference only
}

export const SANDBOX_WEBCAMS: SandboxWebcam[] = [
  // ── Verified 24/7 channels (canonical og:title cross-checked) ───────────
  { webcamId: "ch:UC6qrG3W8SMK0jior2olka3g", title: "Times Square — New York (EarthCam)", lat: 40.758, lng: -73.9855, category: "city", country: "United States", handle: "@EarthCam" },
  { webcamId: "ch:UCCbkDvw6wI4Z5VX3BhSuw7w", title: "Amsterdam Live", lat: 52.3722, lng: 4.8933, category: "city", country: "Netherlands", handle: "@AmsterdamLive" },
  { webcamId: "ch:UCWkB4jlQ0HYbZQUT2iNgGng", title: "Dublin City Live", lat: 53.3498, lng: -6.2603, category: "city", country: "Ireland", handle: "@DublinCityCouncil" },
  { webcamId: "ch:UC2WMV4vCYurHdHPd9pCqYSg", title: "Skyline Webcams — Rome", lat: 41.9028, lng: 12.4964, category: "city", country: "Italy", handle: "@SkylineWebcams" },
  { webcamId: "ch:UCOIkT9bq-1N2BvrsBjhNlag", title: "Railfan Live Crossing — St. Louis", lat: 38.627, lng: -90.1994, category: "transport", country: "United States", handle: "@virtualrailfan" },
  { webcamId: "ch:UCQfwfsi5VrQ8yKZ-UWmAEFg", title: "Paris — France 24", lat: 48.8566, lng: 2.3522, category: "news", country: "France", handle: "@FRANCE24" },
  { webcamId: "ch:UCoMdktPbSTixAyNGwb-UYkQ", title: "London — Sky News", lat: 51.5074, lng: -0.1278, category: "news", country: "United Kingdom", handle: "@SkyNews" },
  { webcamId: "ch:UCknLrEdhRCp1aegoMqRaCZg", title: "Berlin — DW News", lat: 52.52, lng: 13.405, category: "news", country: "Germany", handle: "@DWNews" },
  { webcamId: "ch:UC4i3-yfVazfuqwoz71T79Sw", title: "Miami Surf Cams", lat: 25.7907, lng: -80.13, category: "beach", country: "United States", handle: "@surfline" },
  { webcamId: "ch:UCmmxf8r3US6KJnhMKBG8DEw", title: "Taipei Live", lat: 25.033, lng: 121.5654, category: "city", country: "Taiwan", handle: "@JackyWuTaipei" },
  { webcamId: "ch:UCLav_kTu9PmAEChvGyrPbhQ", title: "Sydney Harbour", lat: -33.8568, lng: 151.2153, category: "harbour", country: "Australia", handle: "@WebcamSydney" },
  { webcamId: "ch:UCLA_DiR1FfKNvjuUpBHmylQ", title: "NASA Live", lat: 29.55, lng: -95.09, category: "space", country: "United States", handle: "@NASA" },
  { webcamId: "ch:UCRuyAVeVd7oUwh0LWmxxBBQ", title: "EarthTV World Live", lat: 48.1351, lng: 11.582, category: "world", country: "Multi", handle: "@earthtv" },
  // ── Middle East / conflict-relevant ─────────────────────────────────────
  { webcamId: "ch:UCvHDpsWKADrDia0c99X37vg", title: "Jerusalem — i24NEWS", lat: 31.7767, lng: 35.2345, category: "news", country: "Israel", handle: "@i24NEWS" },
  { webcamId: "ch:UCos52azQNBgW63_9uDJoPDA", title: "Mecca — Quran TV (Kaaba)", lat: 21.4225, lng: 39.8262, category: "landmark", country: "Saudi Arabia", handle: "@QuranTV" },
  { webcamId: "ch:UC2SO-5oK1SE4IqNXh4oqq1A", title: "Beirut & Levant — Conflict Live 24/7", lat: 33.8938, lng: 35.5018, category: "news", country: "Lebanon", handle: "@WorldConflictLive247" },
  { webcamId: "ch:UC2SO-5oK1SE4IqNXh4oqq1A", title: "Kyiv & Ukraine — Conflict Live 24/7", lat: 50.4501, lng: 30.5236, category: "news", country: "Ukraine", handle: "@WorldConflictLive247" },
  { webcamId: "ch:UCNye-wNBqNL5ZzHSJj3l8Bg", title: "Al Jazeera English", lat: 25.3, lng: 51.5, category: "news", country: "Qatar", handle: "@AlJazeeraEnglish" },
  // ── Asia / space ────────────────────────────────────────────────────────
  { webcamId: "ch:UCGoxeUWHR00E0gjibgjK38w", title: "ISS Earth View", lat: 0, lng: 0, category: "space", country: "Space", handle: "@ISSLiveStream" },
  { webcamId: "ch:UC2j9YVeDkez-niRM85BsvsA", title: "Seoul Live", lat: 37.5665, lng: 126.978, category: "city", country: "South Korea", handle: "@SeoulVibes" },
  { webcamId: "ch:UChKERpE7Um0Uq1btm_a9g5A", title: "Tokyo — Kabukicho Live", lat: 35.6762, lng: 139.6503, category: "city", country: "Japan", handle: "@KabukichoLive" },
  { webcamId: "ch:UCb--64Gl51jIEVE-GLDAVTg", title: "Washington DC — C-SPAN", lat: 38.9072, lng: -77.0369, category: "news", country: "United States", handle: "@cspan" },
  { webcamId: "ch:UCkvW_7kp9LJrztmgA4q4bJQ", title: "Sen — Space Live", lat: 33.9207, lng: -118.3287, category: "space", country: "United States", handle: "@Sen" },
];

/** ch:{UC…} → channel id; yt:{videoId} → legacy video id. */
export function parseWebcamId(webcamId: string): string | null {
  const ch = /^ch:(UC[\w-]{20,24})$/.exec(webcamId.trim());
  if (ch) return ch[1];
  const legacy = /^yt:([A-Za-z0-9_-]{6,20})$/.exec(webcamId.trim());
  return legacy ? legacy[1] : null;
}

export function isChannelWebcamId(webcamId: string): boolean {
  return /^ch:UC[\w-]{20,24}$/.test(webcamId.trim());
}

export function watchUrlFor(webcamId: string): string | null {
  if (isChannelWebcamId(webcamId)) {
    return `https://www.youtube.com/channel/${parseWebcamId(webcamId)}/live`;
  }
  const videoId = parseWebcamId(webcamId);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

export function embedUrlFor(webcamId: string): string | null {
  if (isChannelWebcamId(webcamId)) {
    // Channel live embed — YouTube resolves the channel's CURRENT live
    // stream per request from the viewer's IP. No scraping, no staleness.
    return `https://www.youtube.com/embed/live_stream?channel=${parseWebcamId(webcamId)}&autoplay=1&mute=1&playsinline=1&rel=0`;
  }
  const videoId = parseWebcamId(webcamId);
  return videoId
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0`
    : null;
}

export function thumbnailFor(webcamId: string): string | null {
  // Channel-based entries have no keyless stable thumbnail; the client
  // renders a clean placeholder instead ("Preview unavailable").
  if (isChannelWebcamId(webcamId)) return null;
  const videoId = parseWebcamId(webcamId);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}
