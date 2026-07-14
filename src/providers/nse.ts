/**
 * NSE data provider (India Archivist, A0.2). Free NSE feeds, verified reachable from
 * GitHub Actions CI (Azure IP → HTTP 200). Everything is keyed on the date INSIDE the
 * file, never the URL date — NSE serves a stale duplicate on non-trading days.
 *
 *   • Equity + delivery: sec_bhavdata_full (plain CSV, superset: OHLCV + delivery %)
 *   • FII/DII flows:     www.nseindia.com/api/fiidiiTradeReact (anti-bot host — needs cookie priming)
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

/** "13-Jul-2026" → "2026-07-13" (the format inside NSE files). */
export function parseNseDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mm = MONTHS[m[2][0].toUpperCase() + m[2].slice(1).toLowerCase()];
  if (!mm) return null;
  return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const num = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const t = s.trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
};

export interface NseEquityRow {
  symbol: string; series: string; trade_date: string;
  prev_close: number | null; open: number | null; high: number | null; low: number | null;
  last_price: number | null; close: number | null; avg_price: number | null;
  volume: number | null; turnover_lacs: number | null; num_trades: number | null;
  deliv_qty: number | null; deliv_per: number | null;
}

/**
 * Equity + delivery for one UTC date. Returns null if NSE has no file (weekend/holiday).
 * `contentDate` is parsed from the file's own DATE1 — the caller must reject when it
 * doesn't equal the requested date (guards against the stale-duplicate served on Sundays).
 */
export async function fetchEquityDelivery(d: Date): Promise<{ contentDate: string; rows: NseEquityRow[] } | null> {
  const dd = `${pad(d.getUTCDate())}${pad(d.getUTCMonth() + 1)}${d.getUTCFullYear()}`;
  const url = `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${dd}.csv`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const text = await res.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) return null;

  // space-padded CSV → trim every cell; map header names to indices
  const header = lines[0].split(",").map((h) => h.trim());
  const ix = (name: string) => header.indexOf(name);
  const iSym = ix("SYMBOL"), iSer = ix("SERIES"), iDate = ix("DATE1");
  const rows: NseEquityRow[] = [];
  let contentDate: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",").map((x) => x.trim());
    if (c.length < header.length) continue;
    const td = parseNseDate(c[iDate]);
    if (!td) continue;
    if (!contentDate) contentDate = td;
    rows.push({
      symbol: c[iSym], series: c[iSer], trade_date: td,
      prev_close: num(c[ix("PREV_CLOSE")]), open: num(c[ix("OPEN_PRICE")]), high: num(c[ix("HIGH_PRICE")]),
      low: num(c[ix("LOW_PRICE")]), last_price: num(c[ix("LAST_PRICE")]), close: num(c[ix("CLOSE_PRICE")]),
      avg_price: num(c[ix("AVG_PRICE")]), volume: num(c[ix("TTL_TRD_QNTY")]), turnover_lacs: num(c[ix("TURNOVER_LACS")]),
      num_trades: num(c[ix("NO_OF_TRADES")]), deliv_qty: num(c[ix("DELIV_QTY")]), deliv_per: num(c[ix("DELIV_PER")]),
    });
  }
  if (!contentDate || rows.length === 0) return null;
  return { contentDate, rows };
}

export interface FnoOiRow {
  underlying: string; trade_date: string;
  futures_oi: number; call_oi: number; put_oi: number; total_oi: number;
  pcr: number | null; futures_oi_chg: number;
  near_expiry: string | null; // nearest live contract's ACTUAL expiry (FininstrmActlXpryDt) — real data, not a "last Thursday" rule
}

/** F&O open interest for one UTC date, aggregated per underlying (futures / call / put OI + PCR). */
export async function fetchFnoOi(d: Date): Promise<{ contentDate: string; rows: FnoOiRow[] } | null> {
  const ymd = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const url = `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${ymd}_F_0000.csv.zip`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const csv = Object.values(files)[0];
  if (!csv) return null;
  const lines = strFromU8(csv).trim().split("\n");
  if (lines.length < 2) return null;

  const h = lines[0].split(",").map((x) => x.trim());
  const iSym = h.indexOf("TckrSymb"), iTp = h.indexOf("FinInstrmTp"), iOpt = h.indexOf("OptnTp");
  const iOi = h.indexOf("OpnIntrst"), iChg = h.indexOf("ChngInOpnIntrst"), iDate = h.indexOf("TradDt");
  const iExpiry = h.indexOf("FininstrmActlXpryDt"); // the ACTUAL (holiday-adjusted) expiry, straight from NSE

  const agg = new Map<string, FnoOiRow>();
  const nearExpiry = new Map<string, string>();
  let contentDate: string | null = null;
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    if (c.length < h.length) continue;
    const td = c[iDate]?.trim();
    if (!td) continue;
    if (!contentDate) contentDate = td;
    const sym = c[iSym].trim();
    const oi = num(c[iOi]) ?? 0, chg = num(c[iChg]) ?? 0;
    const tp = c[iTp].trim(), opt = c[iOpt].trim();
    let r = agg.get(sym);
    if (!r) { r = { underlying: sym, trade_date: td, futures_oi: 0, call_oi: 0, put_oi: 0, total_oi: 0, pcr: null, futures_oi_chg: 0, near_expiry: null }; agg.set(sym, r); }
    r.total_oi += oi;
    if (tp === "IDF" || tp === "STF") { r.futures_oi += oi; r.futures_oi_chg += chg; }
    else if (opt === "CE") r.call_oi += oi;
    else if (opt === "PE") r.put_oi += oi;

    const xpry = c[iExpiry]?.trim();
    if (xpry && xpry >= td) { // only future/current-day expiries, ISO strings sort correctly
      const cur = nearExpiry.get(sym);
      if (!cur || xpry < cur) nearExpiry.set(sym, xpry);
    }
  }
  if (!contentDate) return null;
  const rows = [...agg.values()].map((r) => ({
    ...r, pcr: r.call_oi > 0 ? Math.round((r.put_oi / r.call_oi) * 1000) / 1000 : null,
    near_expiry: nearExpiry.get(r.underlying) ?? null,
  }));
  return { contentDate, rows };
}

/** NSE's anti-bot host needs a homepage cookie before any /api/ call will succeed. */
async function nseCookies(): Promise<string> {
  const home = await fetch("https://www.nseindia.com/", { headers: { "User-Agent": UA } });
  return (home.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

export interface FiiDiiRow { trade_date: string; category: "FII" | "DII"; buy_value: number | null; sell_value: number | null; net_value: number | null }

/** Latest FII/DII net flows. The anti-bot host needs a homepage cookie first. */
export async function fetchFiiDii(): Promise<FiiDiiRow[]> {
  const cookies = await nseCookies();
  const res = await fetch("https://www.nseindia.com/api/fiidiiTradeReact", {
    headers: { "User-Agent": UA, Referer: "https://www.nseindia.com/", Cookie: cookies, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`FII/DII fetch ${res.status}`);
  const data = (await res.json()) as Array<{ category: string; date: string; buyValue: string; sellValue: string; netValue: string }>;
  const out: FiiDiiRow[] = [];
  for (const r of data) {
    const td = parseNseDate(r.date);
    if (!td) continue;
    const category = r.category.toUpperCase().startsWith("FII") ? "FII" : "DII";
    out.push({ trade_date: td, category, buy_value: num(r.buyValue), sell_value: num(r.sellValue), net_value: num(r.netValue) });
  }
  return out;
}

export interface AnnouncementRow { symbol: string; seq_id: string; an_dt: string; sort_date: string; desc: string; text: string }

/** NSE corporate announcements for one symbol (News Sentry, A2). UNTRUSTED CONTENT — desc/text
 *  are free text filed by the company; callers must treat them as data to classify, never as
 *  instructions to follow. The anti-bot host needs a homepage cookie first.
 *  Freshness must be judged on `sort_date` (ISO, directly comparable) — NOT `seq_id`, whose
 *  numbering scheme isn't monotonic across NSE's own ID-system eras (a stale 2022 filing can
 *  carry a numerically LARGER seq_id than a fresh 2026 one). */
export async function fetchCorporateAnnouncements(symbol: string): Promise<AnnouncementRow[]> {
  const cookies = await nseCookies();
  const res = await fetch(`https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(symbol)}`, {
    headers: { "User-Agent": UA, Referer: "https://www.nseindia.com/", Cookie: cookies, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`corporate-announcements fetch ${res.status}`);
  const data = (await res.json()) as Array<{ symbol: string; seq_id: string; an_dt: string; sort_date: string; desc: string; attchmntText: string }>;
  return data.map((r) => ({ symbol: r.symbol, seq_id: String(r.seq_id), an_dt: r.an_dt, sort_date: r.sort_date, desc: r.desc ?? "", text: r.attchmntText ?? "" }));
}
