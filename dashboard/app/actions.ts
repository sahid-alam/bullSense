"use server";

// The Test Lab's only server entry point: a thin wrapper over the engine's runBench() core.
// Runs in the Node runtime (outbound fetches to Yahoo/FINRA, reads SUPABASE_* from env).
// The SECRET key is used only here, server-side — it never reaches the browser.
import { runBench, type BenchParams, type BenchResult } from "../../src/lib/benchcore.js";

export async function runBenchAction(params: BenchParams): Promise<BenchResult> {
  // Web never does the slow live-FINRA page-through — archive-first + manual dtc only.
  return runBench({ ...params, allowLiveSI: false });
}
