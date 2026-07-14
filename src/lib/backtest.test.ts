import { backtestSqueeze, type Bar, type SIRow, type SqueezeParams, type TradeDetail } from "./backtest.js";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  → " + detail : ""}`);
  if (!cond) failures++;
};

// Build flat weekday bars (close/vol 100 / 1e6) except a single trigger day that
// crosses above MA20 on a volume spike (close 105, vol 3e6) — the one bar that can
// fire a squeeze entry.
function genBars(startISO: string, endISO: string, triggerISO: string): Bar[] {
  const bars: Bar[] = [];
  const d = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  while (d <= end) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      const date = d.toISOString().slice(0, 10);
      bars.push(date === triggerISO
        ? { date, open: 100, high: 105, low: 100, close: 105, volume: 3_000_000 }
        : { date, open: 100, high: 100, low: 100, close: 100, volume: 1_000_000 });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return bars;
}

const params: SqueezeParams = { minDaysToCover: 5, minRelVolume: 1.5, invalidationPct: 0.10, timeStopDays: 30 };
const si: SIRow[] = [{ settlementDate: "2024-01-15", symbol: "TEST", daysToCover: 10 }];
const spy = genBars("2023-12-01", "2024-03-15", ""); // flat SPY, no trigger

// FINRA settlement 2024-01-15 (Mon) → disseminated ~9 business days later = 2024-01-26.
// A trigger BEFORE that date used data that wasn't public yet: it must NOT trade.
const preDissem = backtestSqueeze(params, si, new Map([["TEST", genBars("2023-12-01", "2024-03-15", "2024-01-22")]]), spy);
check("C1: trigger before SI dissemination is rejected (no look-ahead)", preDissem.trades === 0, `trades=${preDissem.trades}`);

// A trigger AFTER dissemination is real and tradeable — proves the window still fires
// (i.e. the test above isn't passing just because nothing ever trades).
const postDissem = backtestSqueeze(params, si, new Map([["TEST", genBars("2023-12-01", "2024-03-15", "2024-01-30")]]), spy);
check("C1: trigger after SI dissemination still trades", postDissem.trades === 1, `trades=${postDissem.trades}`);

// M15: profit factor must never be the old 99 sentinel — a lossless sample is floored,
// not treated as an infinite edge.
check("M15: no 99 profit-factor sentinel", postDissem.profitFactor < 90, `pf=${postDissem.profitFactor}`);

// BENCH: the optional trade sink collects one detailed row per trade, and it does not
// change the aggregate stats (additive-only). The bench relies on this.
const sink: TradeDetail[] = [];
const withSink = backtestSqueeze(params, si, new Map([["TEST", genBars("2023-12-01", "2024-03-15", "2024-01-30")]]), spy, sink);
check("BENCH: sink collects one row per trade", sink.length === withSink.trades && sink.length === 1, `sink=${sink.length} trades=${withSink.trades}`);
check("BENCH: sink row carries entry/exit/reason", !!sink[0] && sink[0].symbol === "TEST" && typeof sink[0].netReturnPct === "number" && !!sink[0].exitReason, sink[0] ? `${sink[0].entryDate}→${sink[0].exitDate} ${sink[0].exitReason}` : "no row");

console.log(failures === 0 ? "\nALL BACKTEST TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
