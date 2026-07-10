# BullSense — Foundation Audit (2026-07-10)

Full-codebase review (~3,400 LOC) before building anything new. Findings are
grounded in specific `file:line` locations and ranked by how much they threaten
the core thesis: **the receipts/calibration are the product — if the system
overstates its own edge, everything downstream is built on a lie.**

Most findings are *silent-failure* or *optimism* bugs: nothing crashes, but the
numbers quietly flatter the strategy. That is the most dangerous class here.

Verified during audit (NOT bugs):
- Webhook SQL is fully parameterized (postgres.js tagged templates) — no injection.
- Yahoo OHLC is split-adjusted — dividend-only leakage, negligible.
- `claude-sonnet-5` is a valid model id.
- Signal/paper-position writes have dedupe guards — nightly re-runs mostly idempotent.

---

## CRITICAL / HIGH — fix before trusting any receipt

### C1. Backtest enters trades before the short-interest was public (look-ahead)
`backtest.ts:56-60` searches for a trigger in `settlementDate+1 .. +21 calendar
days`, but FINRA short interest is **disseminated ~8 business days after** the
settlement date (confirmed: `si-archive.ts` only ever fetches already-disseminated
settlements). So roughly the first half of every trigger window trades on data
that did not yet exist — **inflating the profit factor the entire Lab optimizes
and promotes against.** This is the single most damaging flaw: the fitness
function the whole "evolve strategies against history" thesis rests on is biased
upward. (Live scout is unaffected — it keys the latest *archived* settlement
against today, so no live look-ahead.)
**Fix:** start the trigger window at `settlementDate + ~9 business days`.

### H1. Short-interest ingestion can silently archive partial/misaligned data
`shortinterest.ts:47` `if (!res.ok) break` — a 429/5xx mid-pagination ends the
loop and the truncated page is persisted **as if it were the full settlement**.
`shortinterest.ts:81` naive `split(",")` misaligns every column if any field
contains a comma. The whole squeeze universe is only as honest as this feed.
**Fix:** throw/retry on non-OK; quote-aware CSV parse; assert non-empty header.

### H2. The Lab selects AND validates on the same test set
`lab.ts:91-101` picks the best variant by `te` (test) profit factor, then runs
the sensitivity gauntlet **also on `siTest`**. The "out-of-sample" PF is therefore
selection-biased — the anti-overfitting machine overfits the holdout. This
directly undercuts the Lab's entire reason to exist.
**Fix:** three-way split (train / select / final-holdout), or nested CV; gauntlet
on a set never used for selection.

### H3. Live scout bypasses two of the four Treasury guardrails
`squeeze.ts:92-95` passes `currentHeatPct: 0` and `peakEquity: p.equity` into
`sizePosition`, so the **portfolio heat cap and drawdown throttle never fire** in
the human-facing "Treasury size." The engine paper fund does it right
(`paperfund.ts:79`), so the number the operator sees is bigger than what the
strategy's own rules allow.
**Fix:** thread real open-heat and peak-equity from `treasury_state` into the scout.

### H4. Survivorship bias — losers silently vanish
Backtest/Lab only score symbols present in the price map (`backtest.ts:52-53`);
delisted/bankrupt names have no bars and are skipped. The live fund marks any
unpriceable position **flat at cost** (`paperfund.ts:47` swallows the throw), so a
name that went to zero never realizes its loss. Both inflate the equity curve —
worst exactly for the squeeze family, whose losers delist most.
**Fix:** point-in-time universe incl. delisted rows in the backtest bundle;
in the live fund, mark unpriceable/halted positions to a real recovery/zero, not cost.

### H5. A promoted genome using new features fires ZERO live signals, silently
`labgen.ts`/`backtest.ts` support `requireAbove50ma`, `minMomentum20`,
`maxMomentum20`; the live scout (`squeeze.ts:54-59`) only computes
`days_to_cover`, `rel_volume`, `close_vs_ma20`. `evaluateEntry` treats a missing
feature as a **silent rule failure** (`genome.ts:41` → `continue`). So the Lab can
propose/promote a genome that the live engine can never trigger — no error, just
silence.
**Fix:** compute all Lab-designable features in the scout; make `evaluateEntry`
throw (or log) on an unknown feature instead of silently failing it.

### H6. Operator gate keys on chat.id, not user id
`telegram-webhook/index.ts:112,67` authorize on `chat.id` only. If any operator
`telegram_chat_id` is a **group**, every member can drive the engine
(`/pause`, `/add`, `/remove`, `/stop`).
**Fix:** gate on `msg.from.id` against a user allowlist, or reject non-private chats.

### H7. Stop fills assumed exact — no gap-through slippage
`backtest.ts:94` and `scorer.ts:48` exit at exactly `invalidation` whenever
`low <= invalidation`. Real gappy microcaps blow *through* stops; combined with a
20bps round-trip friction (`backtest.ts:34`) that's far too low for this universe,
net edge is overstated.
**Fix:** fill gap-downs at the open below the stop; raise friction to a realistic
small-cap spread; sensitivity-test both.

---

## MEDIUM — corrupts metrics or UX, not yet catastrophic

- **M1. Squeeze conviction can never exceed 75.** `si_pct_float` is hardcoded to
  `0.2` (`squeeze.ts:64`); with that term pinned, `conviction` maxes at
  35+0+20+20 = **75** (`genome.ts:83`) — the 75–100 calibration band stays empty
  forever. Fix: feed real SI%-of-float (FMP) or drop the term from the formula.
- **M2. Backtest drawdown metric is meaningless.** `backtest.ts:110` builds the
  equity curve in candidate-array order (not chronological) with a fixed 2% size →
  `maxDrawdownPct` is noise reported as risk. Fix: order trades by entry date.
- **M3. "Walk-forward" is a single fixed holdout.** `lab.ts:15` `CUT=2024-07-01`
  never rolls; as time passes the split ages and the monthly re-tune re-runs the
  identical split unless the bundle is rebuilt. Fix: rolling windows anchored to run date.
- **M4. `latestClose` can return an in-progress bar.** `prices.ts:44` returns the
  last bar, which intraday is today's *unfinished* candle → corrupts marks; also
  throws on empty. Fix: drop the last bar if its date == today / session open; guard empty.
- **M5. Equity curve date skew.** `paperfund.ts` keys `treasury_state` on UTC day
  while regime keys on trading `asOf` (`nightly.ts`); on holidays / late runs they
  diverge, injecting phantom points into the Sharpe/vol series. Fix: thread `asOf` through.
- **M6. Broken pipeline reports healthy.** `nightly.ts:80` dry-runs and exits 0 with
  no `logJobRun` when store config is missing → `/status` and weekly health can't
  see it. Fix: hard-fail (or heartbeat row) in the scheduled environment.
- **M7. Nightly is non-transactional, no per-step try/catch** (`nightly.ts:111-156`)
  → a mid-pipeline throw leaves regime/SI committed but skips the heartbeat, so
  `/status` shows stale success over half-applied state. Fix: per-step catch + always heartbeat.
- **M8. `/pause` contradicts its own promise.** It says "archives keep running" but
  `routineEnabled("nightly")` false → the archiver is skipped while paused
  (`nightly.ts:24`, webhook:434). Fix: pause only signal/fund/briefing; keep archiving.
- **M9. `/took` is replay-unsafe.** `edited_message` is handled like new, no
  `update_id` dedup (webhook:455) → a Telegram retry or an edit re-inserts
  `positions` + `overrides`. Fix: ignore edits; dedup on `update_id` / unique constraint.
- **M10. Confirmations dropped after DB commit.** `reply()` uses Markdown, doesn't
  check `res.ok` (webhook:13,462) → an unbalanced-Markdown body 400s and the operator
  re-issues an already-applied mutation. Fix: check res.ok, fall back to plain text.
- **M11. Inconsistent PostgREST escaping.** `symbol` is `encodeURIComponent`'d but
  `name/source/family/category/kind` are not (`store.ts` various) → malformed queries
  and a mild injection surface. Fix: one `eq(col,val)` helper that always encodes.
- **M12. Hype family self-contamination.** Velocity baseline (`scout.ts:19-27`)
  averages a 24h-rolling mention count over a window that *includes* the current
  spike → understates velocity exactly when it matters; and `bullish_ratio` defaults
  to a fabricated `0.6` (`scout.ts:69`) that can satisfy a `>= 0.6` gate on data
  never observed. Fix: exclude the trailing 24h from the baseline; leave
  `bullish_ratio` undefined when absent so the rule fails as missing.
- **M13. Relative volume includes the current bar in its own denominator.**
  `squeeze.ts:50-51` (also `scout.ts:63`, `backtest.ts:63`) averages the last 20
  bars *including today*, so a true 20× volume day computes as ~13× — systematically
  weakening the confirmation gate. Fix: average the prior 20 bars (`slice(-21,-1)`).
- **M14. A data outage silently forces RISK_OFF.** `radar.ts` indexes
  `arr[arr.length-1]` with no length guards; an absent feed yields `NaN`, and
  `bandRegime(NaN)` falls through to `risk_off` (`radar.ts:48-52`) — so a data gap
  suppresses all live signals and stores a `NaN` score with no alarm. Fix: validate
  series length and surface a health error instead of letting NaN masquerade as risk-off.
- **M15. Loss-free variants can get promoted on a meaningless PF.** `backtest.ts:114`
  sets `profitFactor = 99` when a variant has no losers, which trivially clears the
  Lab's promotion bar → a lucky ~100-trade all-winner variant gets proposed. Fix: cap
  or exclude the no-loss sentinel from promotion.
- **M16. Lab compares against a straw-man incumbent.** `lab.ts:65` hardcodes the
  incumbent's `invalidationPct: 0.10` and omits any filter regardless of the live
  genome's actual `exit`/filters → promotion is decided against a backtest that isn't
  what's live. Fix: derive incumbent params from the live genome `definition`.

---

## LOW — hardening / cleanup

- Webhook secret compared with `!==` (non-constant-time) — timing side-channel.
- `first-briefing.ts` — hardcoded chat id + fabricated CUPID position; delete or flag-gate.
- `routineEnabled` fail-OPENs on a missing routines row (webhook `/pause` won't stop it).
- FINRA loop caps at offset 20000 and doesn't strip CRLF `\r`.
- Telegram sends aren't chunked to 4096 chars.
- `store.ts` dead `count` helper; `RiskPrefs` doc defaults (0.005/0.015) disagree with
  scout defaults (0.01/0.025).
- EDGAR (future): 429-vs-404 conflation, YoY fixed-offset assumes gap-free quarters.
- `prices.ts:26-37` ignores `adjclose` → dividend gaps (not splits) nudge MA20/low20/stops; minor.
- `genome.ts:49` `==` op does strict float equality — will ~never be true; drop it or add epsilon.
- `genome.ts:102-107` time-stop counts weekdays, not the trading calendar (ignores holidays).
- `radar.ts` normalizes `vix_level` over full ~3y history but credit over 252d — inconsistent baselines.

---

## Recommended fix order

1. **Honesty of the data & metrics first** (C1, H1, H4, H7, M1, M2, M4, M5, M13) — until
   these are right, every receipt and calibration number is untrustworthy, and receipts
   are the product. **C1 is the top priority** — it biases the fitness function itself.
2. **Lab integrity** (H2, H5, M3) — before it evolves anything, its holdout must be
   clean and its output must be runnable by the live engine.
3. **Guardrail truth** (H3) — the operator must see the portfolio-aware size.
4. **Webhook safety** (H6, M9, M10) — before more operators or a group chat touch it.
5. **Orchestration visibility** (M6, M7, M8) — so a broken night looks broken.
6. Low-priority cleanup as you touch each file.

Cheap wins doable now with zero new dependencies: H3, M1, M2, M6, M7, and the
LOW cleanups.
