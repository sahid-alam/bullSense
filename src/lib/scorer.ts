/**
 * Receipts scorer (runs nightly). The trust-clock machinery.
 *   - pending_entry → open: fill entry_price at the next regular-session OPEN
 *     after the trigger (never the trigger price — the anti-cherry-picking rule).
 *   - open: mark daily vs SPY; close on invalidation touch, time stop, or 60-session horizon.
 * Entry prices and closes come from real bars; nothing here can edit a frozen signal's
 * analytical fields (the DB trigger forbids it).
 */
import { fetchDailyBars, type Bar } from "../providers/prices.js";
import { getOpenSignals, updateSignal, insertSignalMark } from "../providers/store.js";

const HORIZON_SESSIONS = 60;

export interface ScoreReport { entriesFilled: number; marked: number; closed: string[] }

export async function runScorer(): Promise<ScoreReport> {
  const report: ScoreReport = { entriesFilled: 0, marked: 0, closed: [] };
  const open = await getOpenSignals();
  if (open.length === 0) return report;

  const spy = await fetchDailyBars("SPY", "1y");
  const spyClose = (date: string) => spy.find((b) => b.date >= date)?.close ?? null;

  for (const sig of open) {
    let bars: Bar[];
    try { bars = await fetchDailyBars(sig.symbol, "1y"); } catch { continue; }
    const triggerDate = sig.triggered_at.slice(0, 10);

    // --- fill entry at the first session strictly AFTER the trigger date ---
    let entry = sig.entry_price;
    if (entry == null) {
      const entryBar = bars.find((b) => b.date > triggerDate);
      if (!entryBar) continue; // next session hasn't happened yet
      entry = entryBar.open;
      await updateSignal(sig.id, { entry_price: entry, status: "open" });
      report.entriesFilled++;
    }

    const entryBarIdx = bars.findIndex((b) => b.date > triggerDate);
    if (entryBarIdx < 0) continue;
    const spyEntry = spyClose(bars[entryBarIdx].date);

    // --- walk forward from entry, mark daily, decide exit ---
    let closed: { reason: string; date: string; close: number } | null = null;
    for (let i = entryBarIdx; i < bars.length; i++) {
      const b = bars[i];
      const sessionsHeld = i - entryBarIdx;
      if (i > entryBarIdx && b.low <= sig.invalidation_price) { closed = { reason: "invalidated", date: b.date, close: sig.invalidation_price }; break; }
      if (b.date >= sig.time_stop_date) { closed = { reason: "time_stop", date: b.date, close: b.close }; break; }
      if (sessionsHeld >= HORIZON_SESSIONS) { closed = { reason: "horizon", date: b.date, close: b.close }; break; }
    }

    // mark to the latest available bar (or the close bar)
    const markBar = closed ? bars.find((b) => b.date === closed!.date)! : bars[bars.length - 1];
    const markClose = closed ? closed.close : markBar.close;
    const retPct = (markClose / entry - 1) * 100;
    const spyNow = spyClose(markBar.date);
    const spyRet = spyEntry && spyNow ? (spyNow / spyEntry - 1) * 100 : 0;
    await insertSignalMark({ signal_id: sig.id, mark_date: markBar.date, close: markClose, return_pct: retPct, spy_return_pct: spyRet });
    report.marked++;

    if (closed) {
      await updateSignal(sig.id, { status: `closed_${closed.reason}` });
      report.closed.push(`${sig.symbol}:${closed.reason}(${retPct >= 0 ? "+" : ""}${retPct.toFixed(1)}%)`);
    }
  }

  return report;
}
