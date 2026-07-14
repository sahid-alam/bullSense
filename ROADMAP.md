# BullSense — Build Roadmap

*The execution plan. [FINAL.md](FINAL.md) holds the **why** (v6); this holds the **what, in what order**. Each task is a buildable unit with an exit bar. Check items off as they ship.*

**Legend:** ✅ done · 🔨 in progress · ⬜ not started · 🔒 gated (can't start until a dependency proves out)

---

## Phase 0 — The engine (✅ SHIPPED)

The autonomous US engine, live on GitHub Actions + Supabase at ~$0/mo, all jobs green.

- ✅ Radar (market regime, 5 components, hysteresis)
- ✅ Scout / Squeeze signal family + immutable Receipts scored vs SPY
- ✅ Treasury (fixed-fractional sizing, heat cap, drawdown throttle, concentration cap)
- ✅ Paper fund + risk metrics (Sharpe/Sortino/CAGR)
- ✅ Watchtower (stops, time-stops, **profit targets**), behavioral guards
- ✅ The Lab (walk-forward backtest + anti-overfitting gauntlet + genome invention)
- ✅ Ledger of Beliefs, Analyst Desk dossiers, chat interrogation
- ✅ Telegram bot (19 commands incl. `/took` `/sold` `/stop` `/target`)
- ✅ **Test Lab dashboard** (Next.js, run the engine on any ticker)
- ✅ Pure `runBench()` core shared by CLI + web

**Honest status:** mechanically correct, but the squeeze family is *not yet a proven edge* (bench: PF 0.67 on GME). The trust clock is at 1/30. That's the gap the phases below close.

---

## Phase A0 — Hardening + the Archivist (⬜ DO FIRST)

*Goal: make the desk unable to die silently, and start hoarding the unbackfillable India data before any India strategy needs it. Small, boring, highest time-sensitivity in the whole plan.*

**A0.1 — Operational hardening**
- ✅ Dead-man's switch — `src/jobs/watchdog.ts` + twice-daily cron: pages Telegram if nightly or the India archive is stale (>4d, weekend-safe). Also pings `HEALTHCHECKS_URL` if set — so the moment the operator adds a healthchecks.io check as a repo secret, the external liveness layer activates with zero code change.
- ✅ Failure paging — shared `pageOperators`/`failJob` (`src/lib/alert.ts`) wired into nightly, hype-sweep, briefing, dossier, weekly, lab, backup, watchdog + the Archivist.
- ✅ Price resilience — `fetchDailyBars` tries both Yahoo hosts (query1→query2) before failing.
- ✅ Weekly backup — `src/jobs/backup.ts` + Sunday cron → Supabase Storage `backups/` (verified in CI).
- ⬜ Key rotation (operator action — the shared keys from setup).
- ⬜ *(optional)* healthchecks.io account → add `HEALTHCHECKS_URL` secret to arm the external layer.

**A0.2 — The India Archivist** *(the time-sensitive one)* — ✅ **SHIPPED & verified in CI**
- ✅ `src/providers/nse.ts` — equity bars + **delivery %** (sec_bhavdata_full) + **FII/DII** flows + **F&O open interest** aggregated per underlying (futures/call/put OI + PCR, via fflate zip). *(India VIX/NIFTY fetched live from Yahoo by India Radar, not archived — reconstructable.)*
- ✅ Tables `nse_equity` / `fii_dii_flows` / `nse_fno_oi` / `india_archive_runs`; keyed on the in-file date (idempotent).
- ✅ `src/jobs/india-archive.ts` (+ throttled `--backfill`) + daily GitHub Action 15:30 UTC. Verified in CI. Delivery % + FII/DII + F&O PCR all landing (NIFTY PCR trend 0.81→1.43/wk).
- ✅ Backfilled 78 equity trading days (~6mo, Jan–Jul 2026). Source limits noted: NSE keeps F&O UDiFF only ~1mo (19 days, accretes forward); FII/DII API is latest-day-only (forward capture). Deeper equity backfill possible but gated on R2 offload before it eats the free tier.

**Exit bar:** ✅ **MET** — India archive accreting daily (equity+delivery, FII/DII, F&O OI; 6mo equity history seeded) AND the engine can't fail silently (failure paging + watchdog + backup). **A0 BUILD COMPLETE.** Only two *operator* actions remain (not code): key rotation, and the optional `HEALTHCHECKS_URL` secret to arm the external watchdog layer.

---

## Phase A1 — The Advisor Card + Screener (✅ COMPLETE)

*Goal: deliver the "expert advisor" feel — answer the six questions for any stock, and stand up a daily "what has potential" list.*

- ✅ **Advisor Card** (`src/lib/advisor.ts` `buildAdvisorCard`) — one artifact per stock (US or NSE): market read · potential · enter/avoid · lot size · stop · target. Reuses Radar + Treasury; deterministic potential score (trend/momentum/structure/participation, each cited) + verdict; NSE enriched by archived delivery-% trend + F&O PCR. LLM only narrates.
- ✅ **Honesty (freeze-and-score)** — a sniff-test showed pure momentum's bottom decile beat its top, so the verdict is labeled INTERIM HEURISTIC, frozen immutably in `advisor_cards`, and scored vs benchmark by `markCards()` in nightly. Real alpha remains A2's gauntlet-validated job.
- ✅ **Screener** (`screener_india` RPC) — standing ranked NSE list from the archive: 1m/3m momentum, delivery-% trend, relative volume (factors scoped honestly to the ~78-day depth — no fake 52-week/200DMA).
- ✅ **Surfaced** — dashboard `/advisor` + `/screener` screens, and Telegram `/card SYMBOL` (queue → real engine, no drift) + `/screener` (RPC). Edge fn v13.

**Exit bar:** ✅ MET — ask about any stock, get all six answers; dashboard shows today's ranked shortlist; every verdict frozen & scored.

---

## Phase A2 — India Intelligence (⬜ — needs A0.2 archive maturing)

*Goal: a real India-native desk, not a US engine pointed at `.NS` tickers. Depends on the archive having accumulated history.*

- ✅ **India Radar** — regime for the INR book: India VIX (level + trend), NIFTY trend & breadth (archive-derived, ~2,400 liquid EQ names above 20DMA), FII/DII 5-day net flow (neutral until 5 days accrete), INR/USD + Brent stress → same 0–100 score + hysteresis, own `india_regime_scores` table. Chained after india-archive in CI; wired into `advisor.ts` replacing the v0 stub. Verified live.
- ✅ **India friction model** — `indiaFriction.ts`: real STT/exchange/SEBI/stamp/DP/GST + STCG 20% / LTCG 12.5%, self-tested. Personal books benchmark vs **NIFTY** additively alongside SPY (`benchmark.nifty_close`, `fund_metrics.nifty_return_pct`) — the SPY path is untouched. Surfaced via `/friction` and `/myfund`.
- ⬜ **News Sentry** — RSS (Moneycontrol/ET) + NSE corporate announcements on book names → LLM triage → Watchtower events. *Closes the Cupid gap.*
- ⬜ **Calendar** — earnings, F&O expiry, ex-dividend, RBI/budget dates → Watchtower flags.
- ⬜ **India-native signal families** — delivery-surge, OI-buildup, momentum-breakout, FII-flow-tailwind — bred in the Lab on the archive.
- ⬜ **Trade post-mortems** — every closed trade auto-examined (thesis right/lucky, exit followed, guard fired).

**Exit bar:** at least one India family clears the gauntlet (PF ≥ 1.3 net of India friction over 30 closed signals) and the INR book runs on its own Radar, benchmarked to NIFTY.

---

## Phase A3 — The Scalp Desk (🔒 gated on A2 shipping AND proving)

*Goal: the intraday horizon — the highest-failure activity in trading, so the tightest leash in the system. Does not exist as running code until A2 has proven the India investment desk works.*

- 🔒 Persistent intraday worker (NOT GitHub Actions — needs an always-on process) + 1-min NSE data feed.
- 🔒 Scalp genomes bred in the Lab; a **separate** scalp book/receipts/trust-clock (never blended with invest — Guardrail 9).
- 🔒 Circuit breakers: max-daily-loss halt, hard trades-per-day cap, force-flat by session close.
- 🔒 Paper-only gauntlet: PF ≥ 1.3 over ≥100 paper scalps **net of intraday friction** before a single real rupee.

**Exit bar:** the scalp paper fund clears its stricter gauntlet across a real sample.

---

## Phase A4 — Real money (🔒 gated on the risk-adjusted proof bar)

- 🔒 A small real-money sleeve under the Treasury's full hard caps — only after the paper fund clears PF ≥ 1.3 + positive risk-adjusted returns over 6+ months including a real drawdown (Guardrail 3). Never on ambition, never sooner.

---

## Sequencing at a glance

```
Phase 0 ✅ ──> A0 (hardening + archivist)  ← START HERE
                 │
                 ├─> A1 (advisor card + screener)   ── can run in parallel with the archive maturing
                 │
                 └─> A2 (india intelligence)         ── needs A0.2 archive to have history
                        │
                        └─> A3 (scalp desk) 🔒 ──> A4 (real money) 🔒
```

**Why A0 is first, not A1:** A1 is the more visible win, but the **archive clock is ticking daily** — point-in-time NSE data unrecorded today is gone forever, and A2's whole edge is bred on it. A0 is cheap and unblocks everything Indian. A1 can begin the moment A0.2's Archivist is running.

**Recommended first build:** **A0.2 (the Archivist) + A0.1 (hardening)** together — one focused phase, no dependency on any strategy being good.
