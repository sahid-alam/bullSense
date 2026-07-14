"use server";

// The Test Lab's only server entry point: a thin wrapper over the engine's runBench() core.
// Runs in the Node runtime (outbound fetches to Yahoo/FINRA, reads SUPABASE_* from env).
// The SECRET key is used only here, server-side — it never reaches the browser.
import { runBench, type BenchParams, type BenchResult } from "../../src/lib/benchcore.js";
import { buildAdvisorCard, type AdvisorCard } from "../../src/lib/advisor.js";

export async function runBenchAction(params: BenchParams): Promise<BenchResult> {
  // Web never does the slow live-FINRA page-through — archive-first + manual dtc only.
  return runBench({ ...params, allowLiveSI: false });
}

/** Build an Advisor Card. Dashboard lookups are exploratory — they do NOT freeze a
 *  verdict (the CLI / Telegram do that deliberately, to keep calibration honest). */
export async function buildCardAction(symbol: string, equity?: number): Promise<AdvisorCard> {
  return buildAdvisorCard(symbol, { equity });
}

export interface ScreenRow {
  symbol: string; close: number; mom_1m: number; mom_3m: number;
  delivery_recent: number; delivery_trend: number; rel_volume: number; turnover_lacs: number; score: number;
}

/** The India Screener — calls the screener_india RPC (ranks the archive). */
export async function screenerAction(lim = 25): Promise<ScreenRow[]> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return [];
  const res = await fetch(`${url}/rest/v1/rpc/screener_india`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ lim }),
  });
  if (!res.ok) return [];
  return (await res.json()) as ScreenRow[];
}
