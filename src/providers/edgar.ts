/**
 * SEC EDGAR provider — free, no key. Fundamentals (XBRL company facts) + recent
 * filings (submissions). Powers the Analyst Desk without paid data.
 * SEC requires a descriptive User-Agent with contact info.
 */
const UA = "BullSense research bullsense26@gmail.com";
const H = { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" };

let cikCache: Record<string, string> | null = null;

/** ticker (uppercase) → 10-digit CIK. Cached for the process. */
export async function tickerToCik(symbol: string): Promise<string | null> {
  const t = symbol.replace(/\.[A-Z]+$/, "").toUpperCase(); // strip .NS etc (US only)
  if (!cikCache) {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: H });
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, { ticker: string; cik_str: number }>;
    cikCache = {};
    for (const v of Object.values(raw)) cikCache[v.ticker.toUpperCase()] = String(v.cik_str).padStart(10, "0");
  }
  return cikCache[t] ?? null;
}

interface FactPoint { end: string; start?: string; val: number; form: string; fy?: number; fp?: string }

function daysBetween(a: string, b: string): number {
  return Math.abs((new Date(b).getTime() - new Date(a).getTime()) / 86400_000);
}

function quarterly(facts: any, concepts: string[]): FactPoint[] {
  // Evaluate ALL candidate concepts and keep the series whose data is freshest —
  // XBRL tags change over a company's history (e.g. Revenues → RevenueFromContract...),
  // so "first concept with any data" can return years-stale numbers.
  let best: FactPoint[] = [];
  let bestEnd = "";
  for (const c of concepts) {
    const usd = facts?.[c]?.units?.USD;
    if (!usd) continue;
    // TRUE quarterly points only: 10-Qs report both the 3-month period AND the 6/9-month
    // cumulative under the same tag — keep ~90-day periods so QoQ/YoY compare like-for-like.
    const pts: FactPoint[] = usd.filter(
      (u: any) => (u.form === "10-Q" || u.form === "10-K") && u.start && daysBetween(u.start, u.end) >= 80 && daysBetween(u.start, u.end) <= 100,
    );
    if (pts.length === 0) continue;
    const byEnd = new Map<string, FactPoint>();
    for (const p of pts) byEnd.set(p.end, p);
    const sorted = [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end));
    const latest = sorted[sorted.length - 1].end;
    if (latest > bestEnd) { bestEnd = latest; best = sorted; }
  }
  return best.slice(-8);
}

function shares(facts: any): FactPoint[] {
  const c = facts?.CommonStockSharesOutstanding?.units?.shares
    ?? facts?.EntityCommonStockSharesOutstanding?.units?.shares;
  if (!c) return [];
  const byEnd = new Map<string, FactPoint>();
  for (const p of c) byEnd.set(p.end, p);
  return [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end)).slice(-8);
}

export interface Fundamentals {
  revenue: FactPoint[];
  netIncome: FactPoint[];
  grossProfit: FactPoint[];
  sharesOut: FactPoint[];
}

export async function fundamentals(cik: string): Promise<Fundamentals | null> {
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: H });
  if (!res.ok) return null;
  const d = (await res.json()) as any;
  const g = d?.facts?.["us-gaap"] ?? {};
  const dei = d?.facts?.dei ?? {};
  return {
    revenue: quarterly(g, ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"]),
    netIncome: quarterly(g, ["NetIncomeLoss", "ProfitLoss"]),
    grossProfit: quarterly(g, ["GrossProfit"]),
    sharesOut: shares({ ...g, ...dei }),
  };
}



export async function recentFilings(cik: string, limit = 12): Promise<Array<{ form: string; date: string }>> {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: H });
  if (!res.ok) return [];
  const d = (await res.json()) as any;
  const r = d?.filings?.recent;
  if (!r) return [];
  const out: Array<{ form: string; date: string }> = [];
  const interesting = new Set(["10-K", "10-Q", "8-K", "DEF 14A", "S-1", "424B5"]);
  for (let i = 0; i < r.form.length && out.length < limit; i++) {
    if (interesting.has(r.form[i])) out.push({ form: r.form[i], date: r.filingDate[i] });
  }
  return out;
}

/** Compact, LLM-ready fundamentals summary (YoY-ish deltas, dilution). */
export function summarizeFundamentals(f: Fundamentals): string {
  const fmt = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    return `$${n.toFixed(0)}`;
  };
  const lines: string[] = [];
  const rev = f.revenue;
  if (rev.length >= 2) {
    const last = rev[rev.length - 1], prev = rev[rev.length - 2];
    const yoy = rev.length >= 5 ? rev[rev.length - 5] : null;
    lines.push(`Revenue (latest ${last.end}): ${fmt(last.val)}, prior quarter ${fmt(prev.val)}${yoy ? `, year-ago ${fmt(yoy.val)} (${(((last.val - yoy.val) / Math.abs(yoy.val)) * 100).toFixed(0)}% YoY)` : ""}.`);
  }
  const ni = f.netIncome;
  if (ni.length >= 1) {
    const last = ni[ni.length - 1];
    lines.push(`Net income (latest ${last.end}): ${fmt(last.val)}${last.val < 0 ? " (LOSS)" : ""}.`);
  }
  if (f.grossProfit.length >= 1 && rev.length >= 1) {
    const gp = f.grossProfit[f.grossProfit.length - 1], rv = rev[rev.length - 1];
    if (gp.end === rv.end && rv.val > 0) lines.push(`Gross margin: ${((gp.val / rv.val) * 100).toFixed(0)}%.`);
  }
  const sh = f.sharesOut;
  if (sh.length >= 2) {
    const last = sh[sh.length - 1], first = sh[0];
    const chg = ((last.val - first.val) / first.val) * 100;
    // A >100% swing is almost always a stock split, not real dilution — don't mislabel it.
    const tag = Math.abs(chg) > 100 ? " (likely a stock split — raw comparison unreliable)" : chg > 5 ? " (DILUTION)" : "";
    lines.push(`Shares outstanding: ${(last.val / 1e6).toFixed(0)}M, ${Math.abs(chg) > 100 ? "" : (chg >= 0 ? "+" : "") + chg.toFixed(1) + "% since " + first.end}${tag}.`);
  }
  return lines.length ? lines.join(" ") : "No structured fundamentals available from EDGAR.";
}
