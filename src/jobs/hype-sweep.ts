/**
 * Hype sweep (hourly, US market hours) — v1 is the ARCHIVER:
 * snapshot social sentiment into our own history tables. The Hype genome needs
 * mention *velocity* (24h vs 7d baseline), so the archive must accrue before the
 * signal logic can honestly fire. Every hour archived now is data nobody can buy later.
 */
import { storeAvailable, insertSentimentSnapshots, logJobRun, routineEnabled, touchRoutine } from "../providers/store.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

interface Snap { symbol: string; captured_at: string; source: string; mentions_24h: number | null; rank: number | null; bullish_ratio: number | null }

async function fromApeWisdom(capturedAt: string): Promise<Snap[]> {
  const out: Snap[] = [];
  for (const page of [1, 2]) {
    const res = await fetch(`https://apewisdom.io/api/v1.0/filter/all-stocks/page/${page}`, { headers: { "User-Agent": UA } });
    if (!res.ok) break;
    const json = (await res.json()) as any;
    for (const r of json?.results ?? []) {
      if (!r.ticker || !/^[A-Z]{1,5}$/.test(r.ticker)) continue;
      out.push({
        symbol: r.ticker,
        captured_at: capturedAt,
        source: "apewisdom",
        mentions_24h: r.mentions != null ? Number(r.mentions) : null,
        rank: r.rank != null ? Number(r.rank) : null,
        bullish_ratio: null, // apewisdom exposes upvotes, not sentiment ratio
      });
    }
  }
  return out;
}

async function fromTradestie(capturedAt: string): Promise<Snap[]> {
  const res = await fetch("https://tradestie.com/api/v1/apps/reddit", { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const out: Snap[] = [];
  for (const r of json ?? []) {
    if (!r.ticker || !/^[A-Z]{1,5}$/.test(r.ticker)) continue;
    out.push({
      symbol: r.ticker,
      captured_at: capturedAt,
      source: "tradestie",
      mentions_24h: r.no_of_comments != null ? Number(r.no_of_comments) : null,
      rank: null,
      bullish_ratio: r.sentiment_score != null ? Number(r.sentiment_score) : null,
    });
  }
  return out;
}

async function main() {
  const started = Date.now();
  if (storeAvailable() && !(await routineEnabled("hype-sweep"))) {
    console.log("hype-sweep: disabled or paused — exiting.");
    return;
  }

  const capturedAt = new Date().toISOString();
  const results = await Promise.allSettled([fromApeWisdom(capturedAt), fromTradestie(capturedAt)]);
  const snaps: Snap[] = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const bySource: Record<string, number> = {};
  for (const s of snaps) bySource[s.source] = (bySource[s.source] ?? 0) + 1;

  if (!storeAvailable()) {
    console.log(`[dry-run] captured ${snaps.length} sentiment rows`, bySource);
    console.log(JSON.stringify(snaps.slice(0, 5), null, 2));
    return;
  }

  await insertSentimentSnapshots(snaps);
  const asOf = capturedAt.slice(0, 10);
  await logJobRun("hype-sweep", asOf, "ok", started, { archived: snaps.length, ...bySource });
  await touchRoutine("hype-sweep", `archived ${snaps.length} rows (${Object.entries(bySource).map(([k, v]) => `${k}:${v}`).join(", ")})`);
  console.log(`hype-sweep: archived ${snaps.length} rows`, bySource);
}

main().catch((err) => {
  console.error("hype-sweep failed:", err);
  process.exit(1);
});
