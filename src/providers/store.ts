/**
 * State persistence via Supabase REST (PostgREST) using the secret key.
 * No database password needed — works identically from a laptop and GitHub Actions.
 * All tables are RLS-locked; the secret key is the only way in besides direct pg.
 */

const base = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || url === "placeholder" || !key || key === "placeholder") return null;
  return { url: `${url}/rest/v1`, key };
};

export function storeAvailable(): boolean {
  return base() !== null;
}

async function rest(path: string, init: RequestInit & { preferUpsert?: boolean } = {}): Promise<any> {
  const b = base();
  if (!b) throw new Error("store not configured (SUPABASE_URL / SUPABASE_SECRET_KEY)");
  const headers: Record<string, string> = {
    apikey: b.key,
    Authorization: `Bearer ${b.key}`,
    "Content-Type": "application/json",
    Prefer: init.preferUpsert ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${b.url}/${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`store ${init.method ?? "GET"} ${path}: HTTP ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function upsertRegimeScore(row: {
  date: string; score: number; regime: string; components: object; narrative?: string | null; prev_score?: number | null;
}): Promise<void> {
  await rest("regime_scores?on_conflict=date", { method: "POST", body: JSON.stringify([row]), preferUpsert: true });
}

export async function getRecentRegimes(limit = 5): Promise<Array<{ date: string; score: number; regime: string }>> {
  return await rest(`regime_scores?select=date,score,regime&order=date.desc&limit=${limit}`, {
    method: "GET", headers: { Prefer: "return=representation" },
  }) ?? [];
}

export async function logJobRun(job: string, tradingDate: string, status: "ok" | "error", startedAtMs: number, meta: object): Promise<void> {
  await rest("job_runs", {
    method: "POST",
    body: JSON.stringify([{ job, trading_date: tradingDate, status, started_at: new Date(startedAtMs).toISOString(), ms: Date.now() - startedAtMs, meta }]),
  });
}

export async function routineEnabled(name: string): Promise<boolean> {
  const rows = await rest(`routines?select=enabled,master_paused&name=eq.${name}`, {
    method: "GET", headers: { Prefer: "return=representation" },
  });
  if (!rows || rows.length === 0) return true; // unknown routine → default on
  return rows[0].enabled && !rows[0].master_paused;
}

export async function touchRoutine(name: string, summary: string): Promise<void> {
  await rest(`routines?name=eq.${name}`, {
    method: "PATCH",
    body: JSON.stringify({ last_run_at: new Date().toISOString(), last_summary: summary }),
  });
}

export async function getProfiles(): Promise<Array<{ id: string; name: string; telegram_chat_id: string | null; equity: number; risk_prefs: any }>> {
  return await rest("profiles?select=id,name,telegram_chat_id,equity,risk_prefs", {
    method: "GET", headers: { Prefer: "return=representation" },
  }) ?? [];
}

export async function getBook(profileId: string): Promise<Array<{ symbol: string; exchange: string; kind: string; qty: number; cost_basis: number; invalidation_price: number | null; target_price: number | null; time_stop_date: string | null }>> {
  return await rest(`book?select=symbol,exchange,kind,qty,cost_basis,invalidation_price,target_price,time_stop_date&profile_id=eq.${profileId}`, {
    method: "GET", headers: { Prefer: "return=representation" },
  }) ?? [];
}

export async function getLatestRegime(): Promise<{ date: string; score: number; regime: string; components: any; narrative: string | null } | null> {
  const rows = await rest("regime_scores?select=date,score,regime,components,narrative&order=date.desc&limit=1", {
    method: "GET", headers: { Prefer: "return=representation" },
  });
  return rows?.[0] ?? null;
}

export async function insertBookEvent(ev: {
  profile_id: string; symbol: string; kind: string; triage: "fyi" | "look" | "decide"; summary: string; source_ref?: string;
}): Promise<void> {
  await rest("book_events", { method: "POST", body: JSON.stringify([ev]) });
}

/** Count same-kind events for this symbol in the last N days (spam guard). */
export async function recentEventCount(profileId: string, symbol: string, kind: string, days: number): Promise<number> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = await rest(
    `book_events?select=id&profile_id=eq.${profileId}&symbol=eq.${encodeURIComponent(symbol)}&kind=eq.${kind}&detected_at=gte.${since}`,
    { method: "GET", headers: { Prefer: "return=representation" } },
  );
  return rows?.length ?? 0;
}

export async function insertSentimentSnapshots(rows: Array<{
  symbol: string; captured_at: string; source: string; mentions_24h: number | null; rank: number | null; bullish_ratio: number | null;
}>): Promise<void> {
  if (rows.length === 0) return;
  await rest("sentiment_snapshots?on_conflict=symbol,captured_at,source", {
    method: "POST", body: JSON.stringify(rows), preferUpsert: true,
  });
}

export async function getJobHealth(days = 1): Promise<Array<{ job: string; status: string }>> {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  return await rest(`job_runs?select=job,status&started_at=gte.${since}&order=started_at.desc`, {
    method: "GET", headers: { Prefer: "return=representation" },
  }) ?? [];
}

export interface GenomeRow { id: string; family: string; version: number; definition: any; status: string }

export async function getLiveGenomes(family?: string): Promise<GenomeRow[]> {
  const fam = family ? `&family=eq.${family}` : "";
  return await rest(`genomes?select=id,family,version,definition,status&status=eq.live${fam}`, {
    method: "GET", headers: { Prefer: "return=representation" },
  }) ?? [];
}

/** Recent sentiment history for a symbol/source, newest first (for velocity baselines). */
export async function getSentimentHistory(symbol: string, source: string, sinceIso: string): Promise<Array<{ captured_at: string; mentions_24h: number | null; bullish_ratio: number | null }>> {
  return await rest(
    `sentiment_snapshots?select=captured_at,mentions_24h,bullish_ratio&symbol=eq.${encodeURIComponent(symbol)}&source=eq.${source}&captured_at=gte.${sinceIso}&order=captured_at.desc`,
    { method: "GET", headers: { Prefer: "return=representation" } },
  ) ?? [];
}

/** Distinct symbols seen in the sentiment archive in the last N hours (the hunt list). */
export async function getActiveHypeSymbols(hours: number): Promise<string[]> {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  const rows = await rest(
    `sentiment_snapshots?select=symbol&source=eq.apewisdom&captured_at=gte.${since}`,
    { method: "GET", headers: { Prefer: "return=representation" } },
  );
  return [...new Set((rows ?? []).map((r: any) => r.symbol))] as string[];
}

/** Has this genome already fired on this symbol within `dedupeDays`? */
export async function signalExistsWithin(genomeId: string, symbol: string, dedupeDays: number): Promise<boolean> {
  const since = new Date(Date.now() - dedupeDays * 86400_000).toISOString();
  const rows = await rest(
    `signals?select=id&genome_id=eq.${genomeId}&symbol=eq.${encodeURIComponent(symbol)}&triggered_at=gte.${since}`,
    { method: "GET", headers: { Prefer: "return=representation" } },
  );
  return (rows?.length ?? 0) > 0;
}

export async function insertSignal(sig: {
  genome_id: string; symbol: string; triggered_at: string; trading_date: string;
  conviction: number; evidence: object; thesis_md: string | null; invalidation_price: number;
  time_stop_date: string; regime_at_trigger: string; regime_suppressed: boolean;
}): Promise<number | null> {
  const rows = await rest("signals", {
    method: "POST", body: JSON.stringify([sig]), headers: { Prefer: "return=representation" },
  });
  return rows?.[0]?.id ?? null;
}

/** Open signals awaiting entry-price fill or daily marking. */
export async function getOpenSignals(): Promise<Array<{ id: number; symbol: string; triggered_at: string; trading_date: string; invalidation_price: number; time_stop_date: string; entry_price: number | null; status: string }>> {
  return await rest(
    `signals?select=id,symbol,triggered_at,trading_date,invalidation_price,time_stop_date,entry_price,status&status=in.(pending_entry,open)`,
    { method: "GET", headers: { Prefer: "return=representation" } },
  ) ?? [];
}

export async function updateSignal(id: number, patch: Record<string, any>): Promise<void> {
  await rest(`signals?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function insertSignalMark(m: { signal_id: number; mark_date: string; close: number; return_pct: number; spy_return_pct: number }): Promise<void> {
  await rest("signal_marks?on_conflict=signal_id,mark_date", { method: "POST", body: JSON.stringify([m]), preferUpsert: true });
}

/** Data-quality + coverage stats for the weekly health report. */
export async function weeklyStats(): Promise<{ sentimentRows: number; hypeTickers: number; jobRuns7d: number; jobErrors7d: number; openSignals: number; closedSignals: number }> {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const count = async (path: string) => {
    const rows = await rest(path, { method: "GET", headers: { Prefer: "return=representation", Range: "0-0", "Range-Unit": "items" } });
    return Array.isArray(rows) ? rows.length : 0;
  };
  // use head requests with count for accuracy
  const countExact = async (path: string): Promise<number> => {
    const b = base(); if (!b) return 0;
    const res = await fetch(`${b.url}/${path}`, { method: "HEAD", headers: { apikey: b.key, Authorization: `Bearer ${b.key}`, Prefer: "count=exact" } });
    const cr = res.headers.get("content-range"); // e.g. "0-24/25" or "*/25"
    return cr ? Number(cr.split("/")[1]) || 0 : 0;
  };
  return {
    sentimentRows: await countExact(`sentiment_snapshots?captured_at=gte.${since}`),
    hypeTickers: (await rest(`sentiment_snapshots?select=symbol&captured_at=gte.${since}`, { method: "GET", headers: { Prefer: "return=representation" } }) ?? []).reduce((s: Set<string>, r: any) => s.add(r.symbol), new Set()).size,
    jobRuns7d: await countExact(`job_runs?started_at=gte.${since}`),
    jobErrors7d: await countExact(`job_runs?started_at=gte.${since}&status=eq.error`),
    openSignals: await countExact(`signals?status=in.(pending_entry,open)`),
    closedSignals: await countExact(`signals?status=like.closed_*`),
  };
}

export async function upsertShortInterest(rows: Array<{ symbol: string; settlement_date: string; si_shares: number; days_to_cover: number }>): Promise<void> {
  if (rows.length === 0) return;
  // chunk to keep request bodies reasonable
  for (let i = 0; i < rows.length; i += 500) {
    await rest("short_interest?on_conflict=symbol,settlement_date", {
      method: "POST", body: JSON.stringify(rows.slice(i, i + 500)), preferUpsert: true,
    });
  }
}

/** Most recent settlement date present in the archive. */
export async function latestShortInterestDate(): Promise<string | null> {
  const rows = await rest("short_interest?select=settlement_date&order=settlement_date.desc&limit=1", {
    method: "GET", headers: { Prefer: "return=representation" },
  });
  return rows?.[0]?.settlement_date ?? null;
}

/** Squeeze candidates: latest-settlement rows with days_to_cover >= min, highest first. */
export async function squeezeCandidates(settlementDate: string, minDtc: number, limit: number): Promise<Array<{ symbol: string; days_to_cover: number; si_shares: number }>> {
  return await rest(
    `short_interest?select=symbol,days_to_cover,si_shares&settlement_date=eq.${settlementDate}&days_to_cover=gte.${minDtc}&order=days_to_cover.desc&limit=${limit}`,
    { method: "GET", headers: { Prefer: "return=representation" } },
  ) ?? [];
}

// ===== paper fund / positions (P1) =====

export async function getProfile(id: string): Promise<{ id: string; equity: number; risk_prefs: any } | null> {
  const rows = await rest(`profiles?select=id,equity,risk_prefs&id=eq.${id}`, { method: "GET", headers: { Prefer: "return=representation" } });
  return rows?.[0] ?? null;
}

export async function latestTreasuryState(profileId: string): Promise<{ equity: number; peak_equity: number } | null> {
  const rows = await rest(`treasury_state?select=equity,peak_equity&profile_id=eq.${profileId}&order=date.desc&limit=1`, { method: "GET", headers: { Prefer: "return=representation" } });
  return rows?.[0] ?? null;
}

export async function upsertTreasuryState(s: { profile_id: string; date: string; equity: number; peak_equity: number; drawdown_pct: number; heat_pct: number; regime: string; sizing_multiplier: number }): Promise<void> {
  await rest("treasury_state?on_conflict=profile_id,date", { method: "POST", body: JSON.stringify([s]), preferUpsert: true });
}

/** Live, non-suppressed signals that have had their entry filled but no engine position yet. */
export async function signalsNeedingPaperPosition(): Promise<Array<{ id: number; symbol: string; entry_price: number; invalidation_price: number; conviction: number; regime_at_trigger: string; entry_at: string }>> {
  return await rest(
    `signals?select=id,symbol,entry_price,invalidation_price,conviction,regime_at_trigger,triggered_at&status=eq.open&regime_suppressed=eq.false&entry_price=not.is.null`,
    { method: "GET", headers: { Prefer: "return=representation" } },
  ).then((rows: any[]) => (rows ?? []).map((r) => ({ ...r, entry_at: r.triggered_at }))) ?? [];
}

export async function enginePositionExists(signalId: number): Promise<boolean> {
  const rows = await rest(`positions?select=id&profile_id=eq.engine&signal_id=eq.${signalId}`, { method: "GET", headers: { Prefer: "return=representation" } });
  return (rows?.length ?? 0) > 0;
}

export async function insertPosition(p: { profile_id: string; signal_id: number; symbol: string; qty: number; entry_price: number; entry_at: string; risk_budget_pct: number; invalidation_price: number }): Promise<void> {
  await rest("positions", { method: "POST", body: JSON.stringify([{ ...p, side: "long", status: "open" }]) });
}

export async function getOpenPositions(profileId: string): Promise<Array<{ id: number; signal_id: number; symbol: string; qty: number; entry_price: number; invalidation_price: number; risk_budget_pct: number }>> {
  return await rest(`positions?select=id,signal_id,symbol,qty,entry_price,invalidation_price,risk_budget_pct&profile_id=eq.${profileId}&status=eq.open`, { method: "GET", headers: { Prefer: "return=representation" } }) ?? [];
}

/** Signal ids that have closed (status like closed_*), for closing their paper positions. */
export async function closedSignalOutcomes(signalIds: number[]): Promise<Record<number, { status: string; exit_close: number | null }>> {
  if (signalIds.length === 0) return {};
  const idList = signalIds.join(",");
  const sigs = await rest(`signals?select=id,status&id=in.(${idList})&status=like.closed_*`, { method: "GET", headers: { Prefer: "return=representation" } }) ?? [];
  const out: Record<number, { status: string; exit_close: number | null }> = {};
  for (const s of sigs) {
    // exit price = the last mark's close for that signal
    const marks = await rest(`signal_marks?select=close,mark_date&signal_id=eq.${s.id}&order=mark_date.desc&limit=1`, { method: "GET", headers: { Prefer: "return=representation" } });
    out[s.id] = { status: s.status, exit_close: marks?.[0]?.close ?? null };
  }
  return out;
}

export async function closePosition(id: number, exitPrice: number, realizedPnl: number): Promise<void> {
  await rest(`positions?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: "closed", closed_at: new Date().toISOString(), realized_pnl: realizedPnl }) });
}

export async function sumRealizedPnl(profileId: string): Promise<number> {
  const rows = await rest(`positions?select=realized_pnl&profile_id=eq.${profileId}&status=eq.closed`, { method: "GET", headers: { Prefer: "return=representation" } });
  return (rows ?? []).reduce((a: number, r: any) => a + (Number(r.realized_pnl) || 0), 0);
}

/** Distinct profile ids that currently have any positions (for personal-fund settlement). */
export async function getProfilesWithPositions(): Promise<string[]> {
  const rows = await rest("positions?select=profile_id", { method: "GET", headers: { Prefer: "return=representation" } });
  return [...new Set((rows ?? []).map((r: any) => r.profile_id))] as string[];
}

/** Personal receipts summary for a profile: realized P&L, win/loss counts, open count. */
export async function personalReceipts(profileId: string): Promise<{ closed: number; wins: number; realized: number; open: number }> {
  const closed = await rest(`positions?select=realized_pnl&profile_id=eq.${profileId}&status=eq.closed`, { method: "GET", headers: { Prefer: "return=representation" } }) ?? [];
  const open = await rest(`positions?select=id&profile_id=eq.${profileId}&status=eq.open`, { method: "GET", headers: { Prefer: "return=representation" } }) ?? [];
  const realized = closed.reduce((a: number, r: any) => a + (Number(r.realized_pnl) || 0), 0);
  const wins = closed.filter((r: any) => Number(r.realized_pnl) > 0).length;
  return { closed: closed.length, wins, realized, open: open.length };
}

/** Most recent signal for a symbol (for /took to link a personal position). */
export async function latestSignalForSymbol(symbol: string): Promise<{ id: number; invalidation_price: number; entry_price: number | null; conviction: number } | null> {
  const rows = await rest(`signals?select=id,invalidation_price,entry_price,conviction&symbol=eq.${encodeURIComponent(symbol)}&order=triggered_at.desc&limit=1`, { method: "GET", headers: { Prefer: "return=representation" } });
  return rows?.[0] ?? null;
}

// ===== calibration + overrides (P1) =====

/** Calibration buckets: closed signals grouped by conviction band, with actual win rate.
 *  A signal "wins" if its final mark return_pct > 0. Reveals whether conviction is meaningful. */
export async function calibrationBuckets(): Promise<Array<{ band: string; n: number; winRate: number | null; avgReturn: number | null }>> {
  // closed signals + their final (latest) mark return
  const closed = await rest(`signals?select=id,conviction,status&status=like.closed_*`, { method: "GET", headers: { Prefer: "return=representation" } }) ?? [];
  const bands = [
    { band: "40–55", lo: 0, hi: 55 },
    { band: "55–65", lo: 55, hi: 65 },
    { band: "65–75", lo: 65, hi: 75 },
    { band: "75–100", lo: 75, hi: 101 },
  ];
  const out = bands.map((b) => ({ band: b.band, n: 0, wins: 0, retSum: 0 }));
  for (const sig of closed) {
    const marks = await rest(`signal_marks?select=return_pct&signal_id=eq.${sig.id}&order=mark_date.desc&limit=1`, { method: "GET", headers: { Prefer: "return=representation" } });
    const ret = marks?.[0]?.return_pct;
    if (ret == null) continue;
    const b = out.find((_, i) => sig.conviction >= bands[i].lo && sig.conviction < bands[i].hi);
    if (!b) continue;
    b.n++; b.retSum += Number(ret); if (Number(ret) > 0) b.wins++;
  }
  return out.map((b) => ({ band: b.band, n: b.n, winRate: b.n ? b.wins / b.n : null, avgReturn: b.n ? b.retSum / b.n : null }));
}

export async function insertOverride(o: { profile_id: string; position_id: number | null; override_type: string; system_recommendation: string; actual_action: string; rationale?: string }): Promise<void> {
  await rest("overrides", { method: "POST", body: JSON.stringify([o]) });
}

/** Score an override when its position closes: marginal P&L of the sizing deviation =
 *  (actualQty − suggestedQty) × (exit − entry). Positive = the deviation added money. */
export async function scoreOverrideForPosition(positionId: number, actualQty: number, entryPrice: number, exitPrice: number): Promise<void> {
  const rows = await rest(`overrides?select=id,system_recommendation,outcome_pnl&position_id=eq.${positionId}&outcome_pnl=is.null`, { method: "GET", headers: { Prefer: "return=representation" } });
  for (const o of rows ?? []) {
    const m = String(o.system_recommendation).match(/(\d+)/);
    if (!m) continue;
    const suggested = Number(m[1]);
    const marginal = (actualQty - suggested) * (exitPrice - entryPrice);
    await rest(`overrides?id=eq.${o.id}`, { method: "PATCH", body: JSON.stringify({ outcome_pnl: marginal }) });
  }
}

// ===== analyst desk (P1) =====

export async function latestShortInterestForSymbol(symbol: string): Promise<{ days_to_cover: number; si_shares: number; settlement_date: string } | null> {
  const rows = await rest(`short_interest?select=days_to_cover,si_shares,settlement_date&symbol=eq.${encodeURIComponent(symbol)}&order=settlement_date.desc&limit=1`, { method: "GET", headers: { Prefer: "return=representation" } });
  return rows?.[0] ?? null;
}

export async function latestSentimentForSymbol(symbol: string): Promise<{ mentions_24h: number | null; captured_at: string } | null> {
  const rows = await rest(`sentiment_snapshots?select=mentions_24h,captured_at&symbol=eq.${encodeURIComponent(symbol)}&order=captured_at.desc&limit=1`, { method: "GET", headers: { Prefer: "return=representation" } });
  return rows?.[0] ?? null;
}

export async function insertDossier(d: { symbol: string; stance: string; confidence: number; summary_md: string; triggers: any; entry_price: number | null; spy_at_creation: number | null }): Promise<number | null> {
  const rows = await rest("dossiers", { method: "POST", body: JSON.stringify([d]), headers: { Prefer: "return=representation" } });
  return rows?.[0]?.id ?? null;
}

export async function queuedDossierRequests(): Promise<Array<{ id: number; symbol: string; chat_id: string | null }>> {
  return await rest(`dossier_requests?select=id,symbol,chat_id&status=eq.queued&order=requested_at&limit=10`, { method: "GET", headers: { Prefer: "return=representation" } }) ?? [];
}

export async function completeDossierRequest(id: number, dossierId: number | null, error?: string): Promise<void> {
  await rest(`dossier_requests?id=eq.${id}`, { method: "PATCH", body: JSON.stringify({ status: error ? "error" : "done", dossier_id: dossierId, error: error ?? null }) });
}

export async function latestDossier(symbol: string): Promise<{ id: number; stance: string; confidence: number; summary_md: string; created_at: string } | null> {
  const rows = await rest(`dossiers?select=id,stance,confidence,summary_md,created_at&symbol=eq.${encodeURIComponent(symbol)}&order=created_at.desc&limit=1`, { method: "GET", headers: { Prefer: "return=representation" } });
  return rows?.[0] ?? null;
}

// ===== fund metrics / benchmark (P2) =====

export async function upsertBenchmark(date: string, spyClose: number): Promise<void> {
  await rest("benchmark?on_conflict=date", { method: "POST", body: JSON.stringify([{ date, spy_close: spyClose }]), preferUpsert: true });
}

export async function getBenchmarkSeries(sinceDate: string): Promise<Array<{ date: string; spy_close: number }>> {
  return await rest(`benchmark?select=date,spy_close&date=gte.${sinceDate}&order=date`, { method: "GET", headers: { Prefer: "return=representation" } }) ?? [];
}

export async function getEquitySeries(profileId: string): Promise<Array<{ date: string; equity: number }>> {
  return await rest(`treasury_state?select=date,equity&profile_id=eq.${profileId}&order=date`, { method: "GET", headers: { Prefer: "return=representation" } }) ?? [];
}

export async function upsertFundMetrics(m: { profile_id: string; date: string; days: number; total_return_pct: number; cagr_pct: number; vol_pct: number; sharpe: number; sortino: number; max_drawdown_pct: number; spy_return_pct: number | null }): Promise<void> {
  await rest("fund_metrics?on_conflict=profile_id,date", { method: "POST", body: JSON.stringify([m]), preferUpsert: true });
}

export async function latestFundMetrics(profileId: string): Promise<any | null> {
  const rows = await rest(`fund_metrics?select=*&profile_id=eq.${profileId}&order=date.desc&limit=1`, { method: "GET", headers: { Prefer: "return=representation" } });
  return rows?.[0] ?? null;
}

// ===== lab v1: graveyard + multiple-testing (P2) =====

export async function insertGraveyard(g: { family: string; params: any; rationale: string; cause_of_death: string; train_pf: number; test_pf: number; test_excess_spy: number }): Promise<void> {
  await rest("genome_graveyard", { method: "POST", body: JSON.stringify([g]) });
}

/** Total genomes ever buried — proxy for cumulative variants tested (multiple-testing haircut). */
export async function cumulativeVariantsTested(): Promise<number> {
  const b = base(); if (!b) return 0;
  const res = await fetch(`${b.url}/genome_graveyard?select=id`, { method: "HEAD", headers: { apikey: b.key, Authorization: `Bearer ${b.key}`, Prefer: "count=exact" } });
  const cr = res.headers.get("content-range");
  return cr ? Number(cr.split("/")[1]) || 0 : 0;
}

// ===== ledger of beliefs (P2) =====

/** Record/update a belief. If the stance changed vs the current belief for this
 *  (category, subject), supersede the old one and insert a new record — that
 *  supersession IS the "changed its mind" event. No-op if unchanged. */
export async function recordBelief(b: { category: string; subject: string; stance: string; confidence?: number | null; rationale?: string | null }): Promise<"unchanged" | "changed" | "new"> {
  const current = await rest(`beliefs?select=id,stance&category=eq.${b.category}&subject=eq.${encodeURIComponent(b.subject)}&superseded_at=is.null&limit=1`, { method: "GET", headers: { Prefer: "return=representation" } });
  const cur = current?.[0];
  if (cur && cur.stance === b.stance) return "unchanged";
  if (cur) await rest(`beliefs?id=eq.${cur.id}`, { method: "PATCH", body: JSON.stringify({ superseded_at: new Date().toISOString() }) });
  await rest("beliefs", { method: "POST", body: JSON.stringify([{ ...b, prev_id: cur?.id ?? null }]) });
  return cur ? "changed" : "new";
}

// ===== India Archivist (A0.2) =====

export async function upsertNseEquity(rows: any[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    await rest("nse_equity?on_conflict=symbol,series,trade_date", { method: "POST", body: JSON.stringify(rows.slice(i, i + 500)), preferUpsert: true });
  }
}

export async function upsertFiiDii(rows: any[]): Promise<void> {
  if (rows.length === 0) return;
  await rest("fii_dii_flows?on_conflict=trade_date,category", { method: "POST", body: JSON.stringify(rows), preferUpsert: true });
}

/** Most recent equity trade_date already archived (for skip-if-present + freshness). */
export async function latestNseEquityDate(): Promise<string | null> {
  const rows = await rest("nse_equity?select=trade_date&order=trade_date.desc&limit=1", { method: "GET", headers: { Prefer: "return=representation" } });
  return rows?.[0]?.trade_date ?? null;
}

export async function insertIndiaArchiveRun(r: { trade_date: string | null; equity_rows: number; fii_dii_rows: number; status: string; detail: string }): Promise<void> {
  await rest("india_archive_runs", { method: "POST", body: JSON.stringify([r]) });
}

/** Telegram chat ids for every operator — used to page on a failed/stale capture. */
export async function operatorChatIds(): Promise<string[]> {
  const rows = await rest("profiles?select=telegram_chat_id&telegram_chat_id=not.is.null", { method: "GET", headers: { Prefer: "return=representation" } });
  return [...new Set((rows ?? []).map((r: any) => r.telegram_chat_id).filter(Boolean))] as string[];
}
