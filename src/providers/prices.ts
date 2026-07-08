/**
 * Price provider. FMP once the key exists; Yahoo chart API (free, no key) until then.
 * Yahoo handles US tickers, index symbols (^VIX), and NSE (.NS) alike — which is why
 * the Watchtower can cover the Indian book from day one.
 */

export interface Bar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export async function fetchDailyBars(symbol: string, range: "1y" | "3y" | "5y" | "10y" = "3y"): Promise<Bar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`yahoo ${symbol}: HTTP ${res.status}`);
  const json = (await res.json()) as any;
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`yahoo ${symbol}: empty result`);
  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (close == null) continue;
    bars.push({
      date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      open: q.open?.[i] ?? close,
      high: q.high?.[i] ?? close,
      low: q.low?.[i] ?? close,
      close,
      volume: q.volume?.[i] ?? 0,
    });
  }
  return bars;
}

/** Latest close for a symbol (Book marks, Watchtower checks). */
export async function latestClose(symbol: string): Promise<{ date: string; close: number }> {
  const bars = await fetchDailyBars(symbol, "1y");
  const last = bars[bars.length - 1];
  return { date: last.date, close: last.close };
}
