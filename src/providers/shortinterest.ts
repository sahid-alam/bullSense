/**
 * Short-interest provider — FINRA's free Consolidated Short Interest API.
 * Same source that powered the Squeeze backtest (no key, no cost). Bi-monthly
 * settlement dates; we pull the latest and archive it into `short_interest`.
 */

const FINRA_URL = "https://api.finra.org/data/group/otcMarket/name/ConsolidatedShortInterest";
const KEEP_MARKETS = new Set(["NYSE", "NNM", "NCP", "NGM", "NSC"]); // NYSE + Nasdaq tiers

export interface ShortInterestRow {
  symbol: string;
  settlementDate: string; // YYYY-MM-DD
  shortShares: number;
  avgDailyVol: number;
  daysToCover: number;
}

/** Candidate settlement dates: the 15th and month-end for the last N months,
 *  nudged to the nearest weekday. FINRA settles bi-monthly on/near these. */
function candidateDates(months: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let m = 0; m < months; m++) {
    const y = now.getUTCFullYear();
    const mo = now.getUTCMonth() - m;
    const mid = nudgeWeekday(new Date(Date.UTC(y, mo, 15)));
    const end = nudgeWeekday(new Date(Date.UTC(y, mo + 1, 0)));
    out.push(iso(mid), iso(end));
  }
  return [...new Set(out)].sort().reverse(); // newest first
}
function nudgeWeekday(d: Date): Date {
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function fetchDate(date: string): Promise<ShortInterestRow[]> {
  const rows: ShortInterestRow[] = [];
  let offset = 0;
  while (offset <= 20000) {
    const res = await fetch(FINRA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 5000, offset, compareFilters: [{ compareType: "EQUAL", fieldName: "settlementDate", fieldValue: date }] }),
    });
    if (!res.ok) break;
    const text = await res.text();
    const lines = text.trim().split("\n");
    if (lines.length <= 1) break;
    const header = lines[0].split(",").map((h) => h.replace(/"/g, ""));
    const iSym = header.indexOf("symbolCode");
    const iMkt = header.indexOf("marketClassCode");
    const iShort = header.indexOf("currentShortPositionQuantity");
    const iAdv = header.indexOf("averageDailyVolumeQuantity");
    const iDtc = header.indexOf("daysToCoverQuantity");
    const iSettle = header.indexOf("settlementDate");
    for (let i = 1; i < lines.length; i++) {
      const c = parseCsvLine(lines[i]);
      const market = c[iMkt];
      if (!KEEP_MARKETS.has(market)) continue;
      const sym = c[iSym];
      if (!/^[A-Z]{1,5}$/.test(sym)) continue;
      const dtc = c[iDtc] === "" || c[iDtc] === "999.99" ? NaN : Number(c[iDtc]);
      const shortShares = Number(c[iShort]) || 0;
      if (!isFinite(dtc) || shortShares < 200_000) continue;
      rows.push({
        symbol: sym,
        settlementDate: c[iSettle] || date,
        shortShares,
        avgDailyVol: Number(c[iAdv]) || 0,
        daysToCover: dtc,
      });
    }
    if (lines.length - 1 < 5000) break;
    offset += 5000;
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  return line.split(",").map((f) => f.replace(/^"|"$/g, ""));
}

/** Latest available short-interest settlement, as an array of qualifying rows. */
export async function fetchLatestShortInterest(): Promise<{ date: string; rows: ShortInterestRow[] } | null> {
  for (const date of candidateDates(3)) {
    const rows = await fetchDate(date);
    if (rows.length > 0) return { date, rows };
  }
  return null;
}
