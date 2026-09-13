/**
 * Real market quote data for the World Monitor sandbox API layer.
 *
 * Upstream: Yahoo Finance v8 chart endpoint (keyless, needs a real browser
 * UA). The app's own Vercel/seed pipeline is seed-first (Redis written by
 * Railway seeders), which this sandbox cannot run — these helpers provide the
 * same wire shapes straight from the live upstream with SWR caching.
 *
 * Every number served here is real market data. No synthetic values.
 */

import { fetchUpstream } from "./wm-backend";

export interface YahooQuote {
  symbol: string;
  price: number | null;
  change: number | null; // percent vs previous close
  sparkline: number[];
  fetchedAt: number;
}

const QUOTE_TTL_MS = 4 * 60_000; // fresh window
const QUOTE_STALE_MS = 30 * 60_000; // serve-stale ceiling
const YAHOO_HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

const quoteCache = new Map<string, { quote: YahooQuote | null; at: number }>();
const inflight = new Map<string, Promise<YahooQuote | null>>();

function parseYahooChart(symbol: string, json: unknown): YahooQuote | null {
  const result = (json as { chart?: { result?: Array<Record<string, unknown>> } })?.chart?.result;
  if (!Array.isArray(result) || result.length === 0) return null;
  const first = result[0] as {
    meta?: Record<string, unknown>;
    indicators?: { quote?: Array<{ close?: Array<number | null> }> };
  };
  const meta = first.meta ?? {};
  const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
  const prev =
    typeof meta.chartPreviousClose === "number"
      ? meta.chartPreviousClose
      : typeof meta.previousClose === "number"
        ? meta.previousClose
        : null;
  const change = price != null && prev != null && prev !== 0 ? ((price / prev - 1) * 100) : null;

  const closes = first.indicators?.quote?.[0]?.close ?? [];
  const series: number[] = [];
  for (const v of closes) {
    if (typeof v === "number" && Number.isFinite(v)) series.push(v);
  }
  // Cap the sparkline density (~60 points keeps payloads small; charts stay readable)
  let sparkline = series;
  if (series.length > 60) {
    const step = Math.ceil(series.length / 60);
    sparkline = series.filter((_, i) => i % step === 0);
  }

  return { symbol, price, change, sparkline, fetchedAt: Date.now() };
}

async function fetchYahooChart(symbol: string): Promise<unknown | null> {
  const enc = encodeURIComponent(symbol);
  let lastError: unknown = null;
  for (const host of YAHOO_HOSTS) {
    try {
      // 5d/30m: always returns the last session's data (1d is empty on
      // weekends/holidays — futures close Fri, so sparklines would vanish).
      const res = await fetchUpstream(
        `${host}/v8/finance/chart/${enc}?range=5d&interval=30m`,
        { headers: { accept: "application/json" } },
        12_000,
      );
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}`);
        continue; // try the other host
      }
      if (!res.ok) return null; // bad symbol etc — not retryable
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) console.warn("[wm-market] yahoo fetch failed for", symbol, String(lastError));
  return null;
}

function refreshQuote(symbol: string): Promise<YahooQuote | null> {
  const existing = inflight.get(symbol);
  if (existing) return existing;
  const p = fetchYahooChart(symbol)
    .then((json) => {
      const quote = json ? parseYahooChart(symbol, json) : null;
      quoteCache.set(symbol, { quote, at: Date.now() });
      return quote;
    })
    .catch(() => {
      quoteCache.set(symbol, { quote: null, at: Date.now() });
      return null;
    })
    .finally(() => {
      inflight.delete(symbol);
    });
  inflight.set(symbol, p);
  return p;
}

export async function getQuote(symbol: string): Promise<YahooQuote | null> {
  const hit = quoteCache.get(symbol);
  const now = Date.now();
  if (hit && now - hit.at < QUOTE_TTL_MS) return hit.quote;
  if (hit && now - hit.at < QUOTE_STALE_MS) {
    // Stale but usable: serve immediately, refresh in the background.
    void refreshQuote(symbol);
    return hit.quote;
  }
  return refreshQuote(symbol);
}

/** Bounded-concurrency map (Yahoo bursts cause 429s). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Catalogs (mirror shared/stocks.json + shared/commodities.json) ──────────

export const STOCK_CATALOG: Record<string, { name: string; display: string }> = {
  "^GSPC": { name: "S&P 500", display: "SPX" },
  "^DJI": { name: "Dow Jones", display: "DOW" },
  "^IXIC": { name: "NASDAQ Composite", display: "COMP" },
  AAPL: { name: "Apple", display: "AAPL" },
  MSFT: { name: "Microsoft", display: "MSFT" },
  NVDA: { name: "NVIDIA", display: "NVDA" },
  GOOGL: { name: "Alphabet", display: "GOOGL" },
  AMZN: { name: "Amazon", display: "AMZN" },
  META: { name: "Meta", display: "META" },
  "BRK-B": { name: "Berkshire", display: "BRK.B" },
  TSM: { name: "TSMC", display: "TSM" },
  LLY: { name: "Eli Lilly", display: "LLY" },
  TSLA: { name: "Tesla", display: "TSLA" },
  AVGO: { name: "Broadcom", display: "AVGO" },
  WMT: { name: "Walmart", display: "WMT" },
  JPM: { name: "JPMorgan", display: "JPM" },
  V: { name: "Visa", display: "V" },
  UNH: { name: "UnitedHealth", display: "UNH" },
  NVO: { name: "Novo Nordisk", display: "NVO" },
  XOM: { name: "Exxon", display: "XOM" },
  MA: { name: "Mastercard", display: "MA" },
  ORCL: { name: "Oracle", display: "ORCL" },
  PG: { name: "P&G", display: "PG" },
  COST: { name: "Costco", display: "COST" },
  JNJ: { name: "J&J", display: "JNJ" },
  HD: { name: "Home Depot", display: "HD" },
  NFLX: { name: "Netflix", display: "NFLX" },
  BAC: { name: "BofA", display: "BAC" },
  "000001.SS": { name: "Shanghai Composite", display: "SSEC" },
  "^HSI": { name: "Hang Seng", display: "HSI" },
  "600519.SS": { name: "Kweichow Moutai", display: "MOUTAI" },
  "601318.SS": { name: "Ping An Insurance", display: "PINGAN-A" },
  "600900.SS": { name: "China Yangtze Power", display: "CYPC" },
  "300750.SZ": { name: "CATL", display: "CATL" },
  "688981.SS": { name: "SMIC", display: "SMIC-A" },
  "0700.HK": { name: "Tencent", display: "TENCENT" },
  "1211.HK": { name: "BYD", display: "BYD-H" },
  "0939.HK": { name: "China Construction Bank", display: "CCB-H" },
  "0857.HK": { name: "PetroChina", display: "PETROCHINA-H" },
  "^NSEI": { name: "Nifty 50", display: "NIFTY" },
  "^BSESN": { name: "BSE Sensex", display: "SENSEX" },
  "RELIANCE.NS": { name: "Reliance Industries", display: "RELIANCE" },
  "TCS.NS": { name: "TCS", display: "TCS" },
  "HDFCBANK.NS": { name: "HDFC Bank", display: "HDFCBANK" },
  "ICICIBANK.NS": { name: "ICICI Bank", display: "ICICIBANK" },
  "BHARTIARTL.NS": { name: "Bharti Airtel", display: "AIRTEL" },
  "INFY.NS": { name: "Infosys", display: "INFY" },
  "SBIN.NS": { name: "State Bank of India", display: "SBIN" },
  "LICI.NS": { name: "Life Insurance Corp", display: "LICI" },
  "ITC.NS": { name: "ITC", display: "ITC" },
  "HINDUNILVR.NS": { name: "Hindustan Unilever", display: "HUL" },
  "LT.NS": { name: "Larsen & Toubro", display: "L&T" },
  "BAJFINANCE.NS": { name: "Bajaj Finance", display: "BAJFIN" },
  "ADANIENT.NS": { name: "Adani Enterprises", display: "ADANIENT" },
  "SUNPHARMA.NS": { name: "Sun Pharma", display: "SUNPHARMA" },
  "TITAN.NS": { name: "Titan", display: "TITAN" },
  "M&M.NS": { name: "Mahindra & Mahindra", display: "M&M" },
  "TATASTEEL.NS": { name: "Tata Steel", display: "TATASTEEL" },
  "KOTAKBANK.NS": { name: "Kotak Mahindra Bank", display: "KOTAKBANK" },
};

export const COMMODITY_CATALOG: Record<string, { name: string; display: string }> = {
  "^VIX": { name: "VIX", display: "VIX" },
  "GC=F": { name: "Gold", display: "GOLD" },
  "SI=F": { name: "Silver", display: "SILVER" },
  "HG=F": { name: "Copper", display: "COPPER" },
  "PL=F": { name: "Platinum", display: "PLATINUM" },
  "PA=F": { name: "Palladium", display: "PALLADIUM" },
  "ALI=F": { name: "Aluminum", display: "ALUMINUM" },
  "CL=F": { name: "Crude Oil WTI", display: "OIL" },
  "BZ=F": { name: "Brent Crude", display: "BRENT" },
  "NG=F": { name: "Natural Gas", display: "NATGAS" },
  "TTF=F": { name: "TTF Natural Gas", display: "TTF GAS" },
  "RB=F": { name: "Gasoline RBOB", display: "GASOLINE" },
  "HO=F": { name: "Heating Oil", display: "HEATING OIL" },
  URA: { name: "Uranium (Global X)", display: "URANIUM" },
  LIT: { name: "Lithium & Battery", display: "LITHIUM" },
  "MTF=F": { name: "Newcastle Coal", display: "COAL" },
  "ZW=F": { name: "Wheat", display: "WHEAT" },
  "ZC=F": { name: "Corn", display: "CORN" },
  "ZS=F": { name: "Soybeans", display: "SOYBEANS" },
  "ZR=F": { name: "Rough Rice", display: "RICE" },
  "KC=F": { name: "Coffee", display: "COFFEE" },
  "SB=F": { name: "Sugar No. 11", display: "SUGAR" },
  "CC=F": { name: "Cocoa", display: "COCOA" },
  "CT=F": { name: "Cotton", display: "COTTON" },
  "EURUSD=X": { name: "EUR/USD", display: "EUR/USD" },
  "GBPUSD=X": { name: "GBP/USD", display: "GBP/USD" },
  "USDJPY=X": { name: "USD/JPY", display: "USD/JPY" },
  "USDCNY=X": { name: "USD/CNY", display: "USD/CNY" },
  "USDINR=X": { name: "USD/INR", display: "USD/INR" },
  "AUDUSD=X": { name: "AUD/USD", display: "AUD/USD" },
  "USDCHF=X": { name: "USD/CHF", display: "USD/CHF" },
  "USDCAD=X": { name: "USD/CAD", display: "USD/CAD" },
  "USDTRY=X": { name: "USD/TRY", display: "USD/TRY" },
};

export const SECTOR_ETFS: Array<{ symbol: string; name: string }> = [
  { symbol: "XLK", name: "Technology" },
  { symbol: "XLF", name: "Financials" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLV", name: "Health Care" },
  { symbol: "XLY", name: "Cons. Discretionary" },
  { symbol: "XLP", name: "Cons. Staples" },
  { symbol: "XLI", name: "Industrials" },
  { symbol: "XLB", name: "Materials" },
  { symbol: "XLRE", name: "Real Estate" },
  { symbol: "XLU", name: "Utilities" },
  { symbol: "XLC", name: "Comm. Services" },
];

/** Build the app's MarketQuote wire shape from a Yahoo quote. */
export function toWireQuote(
  q: YahooQuote | null,
  symbol: string,
  catalog: Record<string, { name: string; display: string }>,
): Record<string, unknown> {
  const meta = catalog[symbol];
  return {
    symbol,
    name: meta?.name ?? symbol,
    display: meta?.display ?? symbol,
    price: q?.price ?? 0,
    change: q?.change ?? 0,
    sparkline: q?.sparkline ?? [],
  };
}

/** One shared sweep for a symbol list (dedupes + bounds concurrency). */
export async function sweepQuotes(
  symbols: string[],
  catalog: Record<string, { name: string; display: string }>,
): Promise<{ quotes: Array<Record<string, unknown>>; unavailable: string[] }> {
  const unique = [...new Set(symbols)].slice(0, 120);
  const quotes: Array<Record<string, unknown>> = [];
  const unavailable: string[] = [];
  await mapLimit(unique, 4, async (symbol) => {
    const q = await getQuote(symbol);
    if (q && q.price != null) {
      quotes.push(toWireQuote(q, symbol, catalog));
    } else {
      unavailable.push(symbol);
    }
  });
  return { quotes, unavailable };
}
