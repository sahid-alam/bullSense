# BullSense — Project Report

*2026-07-07. The single, standalone reference for this project. IDEA.md holds the full evolution log (v1→v8) for anyone who wants the history; FINAL.md and SCOPE.md hold the working detail this report is distilled from. This document supersedes nothing — it collects everything into one direction.*

---

## 0. Where this idea came from, and where it landed

The idea started as a vague prompt: *build something that analyzes stocks and finds gainers.* It got there through eight rounds of deliberate sharpening, each one closing a real gap the last round exposed:

1. **Generic screener** → too vague to differentiate from Finviz.
2. **Aggressive, regime-aware signal engine** → added a market-risk gauge (the Radar) that throttles signal aggressiveness, because every aggressive-signal product dies the same way: it doesn't know when to shut up in a bad tape.
3. **Full trade-loop platform** → surveyed the nearest real competitors (TradeZella, Composer, Discord signal groups, WSB sentiment trackers) and found the real gap: nobody owns the *whole* trade lifecycle (context → idea → sizing → tracking → learning), and nobody keeps a public scorecard on their own calls.
4. **Self-learning Lab** → strategies stored as data (genomes), not code, so new ones can be spawned, tested, and retired without a human hand-tuning thresholds forever.
5. **Research OS** → added the Analyst Desk (agentic deep-dive dossiers) and Watchtower (vigilance on real holdings), converging everything into one Decision Queue — "do the research, hand me the last step."
6. **Entity redefinition** → realized this was a *suite of tools*, not something a person could trust. Redefined it as one accountable analyst — autonomous, calibrated, coherent, interrogable — with a public paper fund and a calibration curve as its ultimate receipts.
7. **Personal reframe** → this isn't a product for other people. It's ours. That deletion (no pricing, no growth model, no regulatory hedging) unlocked things a product never could: real broker integration, real dollar sizing, ruthless experimentation.
8. **Cost philosophy, then profit philosophy** → first minimized spend to near-zero, then corrected course: spend where it buys real quality (data reliability, judgment-tier LLM calls), stay free only where free is genuinely the best tool. Finally, the goal itself got sharpened to what it always should have been — **profit is terminal, everything else is instrumental** — which is what pulled the self-learning loop forward and added earned position-sizing escalation, so the system keeps improving and can genuinely excel when a real opportunity appears.

**The direction this converged on, stated once, plainly:**

> **BullSense is our personal, always-on AI analyst, built for one purpose — structured, risk-controlled profit. It researches continuously, sizes every position by formula, keeps getting measurably better the longer it runs, and stakes an immutable scorecard on every call it ever makes, including our own overrides.**

Everything below is that direction, made concrete.

---

## 1. Objective

**Build a personal, always-on AI analyst that produces structured, risk-controlled profit in trading and investing — by taking over the recurring research work, and by enforcing capital discipline that is nearly impossible for a person to hold onto consistently under pressure.**

This objective explicitly rejects two failure modes:
- A research tool that's interesting and well-documented but never provably profitable.
- Profit-seeking without discipline — which is how aggressive personal trading normally ends.

**Success criteria — measurable, checked on a schedule, not by feel:**

| # | Criterion | Bar | Checked |
|---|---|---|---|
| 1 | Operational reliability | System runs unattended with <5% job failure rate | Ongoing |
| 2 | Statistical edge (self-honesty gate) | ≥1 signal family clears profit factor ≥1.3, **net of modeled friction**, over ≥30 closed live signals | Continuously from week 8 |
| 3 | Risk-adjusted performance | Paper fund shows positive Sharpe/Sortino vs. a SPY + T-bill blend over ≥6 months, including at least one real drawdown | Month 8+ |
| 4 | Behavioral honesty | Override receipts give a clear answer on whether manual intervention helps or hurts | Month 8+ |
| 5 | Capital discipline | Zero instances of a position ever sized outside the Treasury's formula | Continuous, enforced in code |
| 6 | Continuous improvement | The system's own strategies are re-validated and re-tuned against fresh data on a running basis, starting month 3 | Ongoing from P1 |

**Real money is gated on criteria 2, 3, and 4 all passing together — never on ambition, never sooner.** This is enforced as a code-level gate on the execution path, not a policy we promise to remember.

---

## 2. Aim — what BullSense is

**BullSense is one accountable AI analyst, not a suite of tools.** The distinction matters: people trust a person-shaped thing with judgment, memory, and a reputation to lose — not a dashboard of features. Every capability below is an organ of one entity, not a separate product surface.

It is:
- **Autonomous** — runs continuously on scheduled routines; we touch nothing but the pause switch.
- **Accountable** — every call is frozen at creation and scored against the market forever; it runs a paper portfolio under its own published rules.
- **Calibrated** — its conviction scores are probabilities we can audit ("when it says 70, is it right ~70% of the time?").
- **Coherent** — it maintains a versioned Ledger of Beliefs; we can read what it believes and when it changed its mind.
- **Personal** — it watches our real holdings, sizes in our real dollars, and measures whether it makes us better (User Alpha).
- **Interrogable** — challenge any call; it defends or concedes from cited evidence, never vibes.
- **Continuously improving** — treats a static rule set as a bug; the Lab re-tunes and evolves strategies for as long as the project runs.
- **Cost-disciplined** — engineered for best features per dollar (~$100–180/month), not lowest possible dollar.

### The anatomy — eight organs

| Organ | Surface | What it does |
|---|---|---|
| Situational awareness | **Radar** | Daily 0–100 market risk score (VIX level + term structure, breadth, index trend, credit stress) → RISK-ON / NEUTRAL / RISK-OFF, with hysteresis so a regime call can't flicker. Throttles everything downstream. |
| Attention | **Scout** | Aggressive signal families (hype velocity, squeeze setups, momentum breaks, insider clusters), each a versioned JSON "genome" with a conviction score, cited evidence, and an explicit invalidation price. |
| Deep thought | **Analyst Desk** | Multi-agent dossiers: specialists (fundamentals, filing forensics, promise-vs-delivery, technicals, skeptic-quant) feed a bull-vs-bear debate, resolved into a cited verdict with machine-checkable "what would change our mind" triggers. |
| Vigilance | **Watchtower** | Our real holdings and watchlist (the Book), swept nightly against thesis triggers, filings, insider moves, short-interest spikes, and earnings dates — triaged as FYI / worth a look / needs a decision. |
| Conversation | **Decision Queue** (via Telegram) | The daily briefing: "N situations need your decision" — each pre-researched down to pure judgment. |
| Learning | **The Lab** | Continuous improvement in two speeds: **v0** re-tunes the genomes already live every month against fresh data; **v1→v2** spawns entirely new strategy candidates, runs them through an anti-overfitting gauntlet, incubates survivors in live shadow, and promotes or retires them autonomously. Fitness is judged at the **portfolio** level — does this genome improve the fund's net risk-adjusted profit — not just its own isolated stats. |
| Reputation | **Receipts** | Immutable: entry price = next open, suppressed signals scored too, per-family and regime-split stats, a Brier calibration table, and the paper-fund equity curve. |
| **Capital discipline** | **The Treasury** | The missing governor: converts every idea into a sized, capped, regime-scaled position. Detailed fully in §4.5. |

---

## 3. Features — what ships, and why each one earns its place

Priority key: **P0** (must, weeks 1–8) · **P1** (should, months 3–4) · **P2** (could, months 5–8) · **P3** (later, month 9+, gated on proof).

| Organ | Feature | Priority | Serves the objective by |
|---|---|---|---|
| Radar | Daily 0–100 regime score, 5-year backfill, hysteresis, AI narrative | P0 | Gives every downstream decision market context — the throttle everything else obeys |
| Treasury | Fixed-fractional position sizing + portfolio heat cap, applied to the paper fund from its first trade | P0 | The "structured" half of structured profit — without this, signals are just opinions |
| Scout | Hype Surge + Squeeze Setup genomes, signal cards with cited evidence + invalidation price | P0 | The idea-generation engine; deliberately only 2 families so the receipts clock stays honest early |
| Receipts | Immutable signal freeze, net-of-friction stats, regime-split performance, Engine Console | P0 | The anti-self-deception spine everything else depends on |
| Watchtower | Real-holdings Book, nightly sweep, triaged Telegram alerts | P0 (pulled forward) | Protects actual money before any signal logic is trusted |
| Decision Queue | Daily Telegram briefing: Radar + new signals + Watchtower events | P0 | The daily interface — the loop closes here or it doesn't close at all |
| Treasury — regime/drawdown scaling | Exposure ceiling shrinks with regime; a drawdown throttle halves or pauses sizing | P1 | Closes the "hot streak → blowup" gap — the most common way disciplined systems still fail |
| Analyst Desk | FMP-fed specialist agents → bull/bear debate → cited verdict + thesis triggers | P1 | Replaces hours of manual filing/transcript reading with a five-minute agentic pass |
| Personal tracking | One-tap TRACK, personal receipts, calibration table | P1 | Foundation for User Alpha and the calibration curve |
| Treasury — override receipts | Every manual override logged and scored like a signal | P1 | Closes the loop on our own discretion, with real numbers instead of a feeling |
| **Lab v0** | Genome format + backtest engine; monthly parameter mutation + walk-forward re-validation of the two live genomes | **P1, pulled forward** | Continuous improvement starts month 3, not month 5 — a static rule set is treated as a bug |
| **Lab v1→v2** | LLM-generated new-genome hypotheses, the anti-overfitting gauntlet, live shadow incubation, autonomous promote/retire, public graveyard — fitness judged at the portfolio level | P2 | The self-learning core reaches full strength — discovers new edges, not just re-tunes old ones |
| **Treasury — conviction escalation** | Fractional-Kelly sizing tier, earned per-genome once it has ≥50 closed signals, a validated calibration curve, and net profit factor ≥1.3 | P2 | Lets a genuinely excellent, proven opportunity get a genuinely larger position — mechanically, never by feel |
| Ledger of Beliefs | Versioned worldview from Radar narratives + dossier stances | P2 | Coherence — lets us audit when and why the analyst changed its mind |
| Paper fund | Full CAGR / max-drawdown / Sharpe / Sortino reporting under the Treasury's live rules | P2 | The actual acceptance test for real money (criterion 3) |
| Chat interrogation | Ask the Desk or the Lab "why" over Telegram | P2 | Interrogability — makes the reasoning corpus usable, not just archived |
| Real-money sleeve | Small live allocation via Alpaca, under the Treasury's full caps | P3 — gated on criteria 2–4 | The actual payoff, deliberately gated behind proof, not timeline |
| Defined-risk options | Debit spreads for Hype/Squeeze instead of raw stock | P3 | Caps downside to a known number even through a price gap — a real risk upgrade, not a cost decision |

**Cut permanently, not deferred** (commercial-product chrome that never served this objective): public waitlist, marketing landing page, social share cards, Discord distribution, multi-tenant auth, billing, disclosures-as-legal-shield. There is one user. None of this produces profit.

---

## 4. How — architecture and approach

### 4.1 Stack

```
GitHub Actions (cron)  ──►  job scripts (Node/TS)
                               │
      ┌────────────────────────┼─────────────────────────┐
      ▼                        ▼                          ▼
   FMP API              Paid sentiment vendor        Claude API
 (bars, fundamentals,    (Hype family feed,           (tiered: Haiku for routine
  filings, SI, insider,   selected weeks 6–8)          calls / Sonnet+ for judgment —
  transcripts, calendar)                               Desk debates, Lab hypotheses)
      │                        │                          │
      └──────────────► Neon Postgres (state) ◄────────────┘
                        Cloudflare R2 + DuckDB (bulk history, Lab backtests)
                               │
                  Vercel Hobby (Next.js dashboard, read-only)
                               │
                        Telegram bot (primary interface: briefings,
                        alerts, decision queue, chat interrogation)
```

Guiding principle: **best value per dollar, not lowest possible dollar.** FMP is bought from week one (not waited-on) because one reliable API beats hand-parsing four government data sources. GitHub Actions, Alpaca's free price data, and Telegram stay free because they're genuinely the best tool for the job, not because they're cheapest. All external data flows through a `providers/` abstraction — swapping the sentiment vendor, or adding options-flow data later, is one adapter, not a rewrite.

### 4.2 Universe

US common stocks (NYSE/NASDAQ/AMEX): price ≥ $1, market cap ≥ $100M, 20-day average dollar volume ≥ $2M. ≈3,000 tickers, refreshed weekly via FMP's screener. ETFs excluded except the regime set (SPY, QQQ, IWM, HYG, LQD).

### 4.3 Data model (Neon Postgres)

```
tickers            (symbol PK, name, exchange, sector, mcap, is_active, universe_flags)
daily_bars         (symbol, date, o, h, l, c, volume, PK(symbol,date))          -- 10y backfill
ma_cache           (symbol, date, ma20, ma50, ma200, rel_volume, high_52w)
sentiment_snapshots(symbol, captured_at, source, mentions_24h, rank, bullish_ratio)  -- archive
short_interest     (symbol, settlement_date, si_shares, si_pct_float, days_to_cover) -- archive
regime_scores      (date PK, score, regime, components jsonb, narrative, prev_score)
genomes            (id PK, family, version, definition jsonb, status, lineage jsonb, created_at)
signals            (id PK, genome_id FK, symbol, triggered_at, trading_date,
                    conviction, evidence jsonb, thesis_md, invalidation_price,
                    time_stop_date, regime_at_trigger, entry_price, status)
signal_marks       (signal_id, mark_date, close, return_pct, spy_return_pct, PK(signal_id, mark_date))
book               (symbol, kind [holding|watchlist], qty, cost_basis, added_at)   -- Watchtower's targets
book_events        (id, symbol, kind, detected_at, triage [fyi|look|decide], summary, source_ref)
positions          (id PK, signal_id FK NULL, symbol, side, qty, entry_price, entry_at,
                    risk_budget_pct, invalidation_price, status, closed_at, realized_pnl)  -- Treasury-sized
treasury_state     (date PK, equity, peak_equity, drawdown_pct, heat_pct, regime, sizing_multiplier)
overrides          (id PK, position_id FK, override_type, system_recommendation,
                    actual_action, rationale, outcome_pnl)                          -- override receipts
job_runs           (id, job, trading_date, status, started_at, ms, meta jsonb)
routines           (name PK, enabled, master_paused, last_run_at, next_run_at, last_summary)
```

Signals reference a genome id + version from day one, even though the P0 genomes are hand-written — when the Lab arrives, nothing migrates; it just starts writing new rows.

### 4.4 The Radar — specification

Five weighted components, each normalized against 3-year percentile history: VIX level (20%), VIX term structure (15%), breadth — % of S&P 500 above its 50-day average (25%), index trend (25%), credit stress via HYG/LQD (15%). Mapped to RISK-ON (≥65) / NEUTRAL (40–64) / RISK-OFF (<40), with a regime flip requiring **two consecutive confirming closes** to prevent flicker. Five-year backfill computed at build time. A short AI narrative is generated once per day and frozen — never regenerated after the fact.

### 4.5 The Treasury — capital and risk governance (the profit layer)

Every other organ produces *ideas*. None of them, alone, produce *profit* — that depends entirely on how much is risked, how positions interact, and what happens after a loss. The Treasury sits between every idea-generating organ and any actual dollars and enforces six rules mechanically, never by feel:

1. **Fixed-fractional sizing.** `risk_budget = equity × per_trade_risk% (0.5–1.5%)`; `position_size = risk_budget ÷ (entry − invalidation)`. Conviction only moves where in that band a trade sits — never a 20x swing on a feeling.
2. **Portfolio heat cap.** Sum of every open position's risk budget capped at ~15–20% of equity, with a same-sector sub-cap, so several "different" signals can't secretly be one concentrated bet.
3. **Regime scales exposure, not just entries.** The heat ceiling itself shrinks with regime (20% → 12% → 5%), forcing a partial de-risk of existing weak positions on a downgrade — not just a freeze on new ones.
4. **Drawdown throttle.** A 10% drawdown from equity peak halves sizing; an 18% drawdown forces a full pause pending review. The single most common way disciplined systems still blow up — over-leveraging after a hot streak — closed off structurally.
5. **Expectancy net of friction.** Every family's stats are reported after modeled commissions, slippage, and short-term capital-gains tax drag. A genome only earns promotion or real-money graduation on *net*, not gross, expectancy.
6. **Earned conviction escalation.** Once a genome has ≥50 closed live signals, a validated calibration curve, and net profit factor ≥1.3, it graduates to a fractional-Kelly sizing tier (¼–½ Kelly, capped around 3% per trade vs. the flat 1.5% ceiling everything else uses) — still governed by rules 2 and 4. This is how the system **excels at a genuinely great opportunity**: a proven idea gets meaningfully more capital, mechanically, from a formula fed by real calibration data — never from "this one feels different."

Additionally: **override receipts** log every manual deviation from the Treasury or Scout and score it like a signal, giving an honest answer on whether our own judgment adds value. And **the real success bar is risk-adjusted**, not just "beats a coin flip" — CAGR, max drawdown, and Sharpe/Sortino vs. a SPY + T-bill blend, tracked on the paper fund from month one.

### 4.6 Launch signal genomes (P0)

**hype-surge-v1** (hourly, market hours): mentions_24h ≥30, mention velocity ≥3.0× the 7-day pace, bullish ratio ≥0.60, relative volume ≥2.0, day change ≥2.0% (price must confirm — never front-run pure chatter). Regime-gated to RISK-ON/NEUTRAL. Invalidation: trigger-day low or -8%. Time stop: 10 sessions.

**squeeze-setup-v1** (nightly): short interest ≥20% of float, days-to-cover ≥4, close crosses above the 20-day average, relative volume ≥1.5, short-interest data age ≤21 days (stale data produces no signal). Regime-gated to RISK-ON/NEUTRAL. Invalidation: 20-day low or -10%. Time stop: 30 sessions.

Each fires a signal card: ticker, conviction 0–100, three cited evidence bullets, an AI-written thesis with risk flags, invalidation price, time stop, regime badge, and the Treasury-computed position size shown alongside conviction.

### 4.7 Receipts methodology

Entry price is always the next regular-session open — never the trigger-time price, which would be cherry-picking. Marked daily against SPY. Closed by invalidation touch, time stop, or a 60-session horizon. Every stat is computed **net of modeled friction** (commissions, slippage, tax drag) — a strategy that's only profitable on idealized fills isn't a strategy. Signals suppressed by the regime gate are frozen and scored too, so the gate's own value is provable, not assumed.

### 4.8 Job lattice (GitHub Actions, ET)

| Schedule | Job | Work |
|---|---|---|
| Hourly, 10:00–16:00 Mon–Fri | `hype-sweep` | Pull sentiment → archive → run hype genome → size via Treasury → new signals + theses → Telegram alert |
| 17:30 Mon–Fri | `nightly` | Ingest bars → refresh moving averages → compute Radar + narrative → run squeeze genome → mark/close open positions → update Treasury drawdown state → Watchtower sweep |
| 18:15 Mon–Fri | `briefing` | Telegram digest: Radar score + delta + narrative, new signals, Watchtower events, receipts snapshot |
| Sunday 12:00 | `weekly` | Universe refresh, data-quality audit, job health report |

Jobs are idempotent and keyed by trading date — a rerun never double-writes. A `routines` table plus a master pause flag governs the always-on principle: pausing stops new signals and alerts, but archiver routines keep running regardless — the analyst sleeps, its memory doesn't.

### 4.9 Interfaces

Telegram is the primary, daily interface — briefings, real-time alerts, and (from P2) chat interrogation. The web dashboard (Vercel Hobby, read-only) exists for deep dives: `/radar`, `/signals`, `/receipts`, `/engine` (routine heartbeats and the master pause), `/treasury` (heat, drawdown state, sizing and override logs), `/methodology` (every formula, published verbatim). No landing page, no waitlist, no multi-user auth — there's one user.

### 4.10 Cost architecture — best value, not lowest cost

| Need | Choice | Cost |
|---|---|---|
| Scheduled jobs | GitHub Actions | $0 — genuinely the best fit at this scale |
| Dashboard | Vercel Hobby | $0 |
| State database | Neon, free → paid when warranted | $0–19/mo |
| Bulk history | Cloudflare R2 + DuckDB | $0–5/mo |
| Prices | Alpaca free market data | $0 — sufficient for this trading cadence |
| **Fundamentals, filings, SI, insider trades, transcripts** | **FMP Premium/Growth, bought week one** | **~$29–59/mo** |
| **Social sentiment** | **Paid vendor, selected weeks 6–8** | **~$20–35/mo** |
| Options flow (P2+) | Unusual Whales or comparable, once a family needs it | ~$50–75/mo |
| Interface | Telegram bot | $0 |
| LLM | Claude, tiered (Haiku routine / Sonnet+ for judgment calls), batched, cached | ~$25–60/mo |
| Domain | Real domain | ~$1/mo |

**Realistic total: ~$100–140/month in Phase 1, ~$150–215/month once options flow lands.** Deliberately between an all-free hobby stack and a $1,000+/month professional terminal — real data quality and judgment-tier LLM spend where it compounds into better decisions, without paying for infrastructure a one-person project doesn't need.

---

## 5. Complete build breakdown, in phases

### Phase P0 — The engine (weeks 1–8)
**Goal:** the engine runs end-to-end on real data; the trust clock starts at the end.

| Wk | Deliverable | Proof it works |
|---|---|---|
| 1 | Repo, schema, providers layer, FMP purchased and wired in, universe + 10-year bar backfill | ~3,000 tickers, ~7.5M bar rows, spot-checked against FMP directly |
| 2 | Radar computation + 5-year backfill + hysteresis + `/radar` page | Known selloffs (e.g. Aug-24, Apr-25) land as RISK-OFF on the backfilled history |
| 3 | Sentiment vendor selected + archiver + hype genome + **Treasury v0** (fixed-fractional sizing) | A week of live snapshots; dry-run signals carry sane, formula-computed sizes |
| 4 | Squeeze genome + signal cards + AI thesis + Telegram alerts | End-to-end: trigger → sized card → Telegram push |
| 5 | Outcome scorer (net of friction) + `/receipts` + `/methodology` | Marks match a manual calculation on 10 sampled signals |
| 6 | Watchtower (Book + nightly sweep + triaged alerts) | A seeded test event (a real recent 8-K) triages correctly |
| 7 | `/treasury` dashboard + override logging + `/engine` console | Portfolio heat and drawdown state visible and correct against hand-calculation |
| 8 | Hardening: idempotency tests, job-failure alerting, full daily briefing | A killed mid-run job reruns clean; pause verifiably stops signals while the archiver keeps running |

**End of week 8:** not a launch — there's no audience. It's the point past which the system's own signals start being trusted, per the 30-closed-signal, net-of-friction bar (Objective, criterion 2).

### Phase P1 — The scholar, and the first turn of the crank (months 3–4)
**Goal:** deep research replaces manual reading; continuous improvement begins.

- **Analyst Desk v1** — FMP-fed specialist agents (fundamentals, filing forensics, promise-vs-delivery, technicals, skeptic-quant) → bull/bear debate → cited verdict with thesis triggers wired directly into the Watchtower.
- **Treasury — regime/drawdown scaling** goes live: the heat ceiling now moves with the Radar, and the drawdown throttle is enforced.
- **Personal tracking** — one-tap TRACK, personal receipts, the calibration table begins silently accruing.
- **Override receipts** — every manual deviation from the system is logged and scored.
- **Lab v0** — monthly parameter mutation and walk-forward re-validation of the two live genomes against the freshest data. This is the deliberate acceleration: continuous improvement now starts three months in, not five.

### Phase P2 — The mind (months 5–8)
**Goal:** full self-learning, coherence, and the real acceptance test for capital.

- **Lab v1→v2** — LLM-generated new-genome hypotheses, the full anti-overfitting gauntlet (walk-forward validation, realistic costs, a multiple-testing penalty, sensitivity checks), live shadow incubation on unseen data, autonomous promotion and retirement, a public graveyard. Fitness judged at the portfolio level.
- **Treasury — conviction escalation** goes live the moment any genome earns it (≥50 closed signals, validated calibration, net PF ≥1.3) — not on a fixed calendar date.
- **Ledger of Beliefs** — Radar narratives and dossier stances become structured, versioned claims; a page showing what the system currently believes and when it changed its mind.
- **Paper fund** — full CAGR, max drawdown, and Sharpe/Sortino reporting under the Treasury's live rules. This is the actual gate real money must clear.
- **Chat interrogation** — ask the Desk or Lab "why" directly over Telegram.

### Phase P3 — The hands (month 9+, gated on proof, not on timeline)
**Goal:** capital follows proof, and the system's edges deepen.

- **Real-money sleeve** via Alpaca — only once the paper fund clears its risk-adjusted bar over ≥6 months including a real drawdown, the calibration curve is honest, and override receipts have rendered their verdict. Strictly under the Treasury's full caps from day one.
- **Defined-risk options** (debit spreads) for the aggressive families — caps downside to a known number even through a price gap, which a stock stop-loss cannot guarantee.
- **Options-flow data** for an expanded Smart Money family, once it exists and would use it.
- Quiet optionality: a healthy year of receipts, calibration, and risk-adjusted performance means the original commercial version of this idea (documented in full in IDEA.md) can reactivate at any time, with a founding story and a real track record no competitor could fake.

---

## 6. Guardrails (non-negotiable, kept as code)

1. Receipts are immutable — no edits after freeze, ever.
2. Signals earn real attention only after net profit factor ≥1.3 across ≥30 closed live signals.
3. Real-money autopilot only after the paper fund clears its risk-adjusted bar over ≥6 months including a real drawdown, and the calibration curve is honest.
4. Every feature must earn its place in the daily loop, or it gets deleted.
5. Spend where it buys real quality; skip spend that duplicates something already free and already excellent.
6. No position is ever sized by feel — every dollar amount is computed by the Treasury's formula.
7. Escalated sizing is earned, never assumed — a genome stays on flat sizing until its own track record proves otherwise.
8. The system must never stop learning — a static rule set is treated as a bug, not a finished state.

## 7. Risks, named honestly

- **Abandonment**, not competition, is the real risk to a solo project — mitigated by shipping the daily briefing first, so the system talks to us whether or not we open a dashboard.
- **Self-deception** is easy with no outside eyes — mitigated by making receipts immutability code, not policy, and scoring our own overrides with the same rigor as the machine's calls.
- **Over-engineering** — every feature must earn its place in the weekly loop or get cut.
- **Automating real money too early** is the one genuinely dangerous failure mode — the gate exists specifically to make that decision unemotional.
- **Overfitting is the default outcome of any strategy search, not the edge case** — the Lab's gauntlet (walk-forward validation, a multiple-testing penalty, sensitivity checks, live incubation on unseen data) exists because every shortcut here produces strategies that look great in backtest and lose money live, publicly, on our own receipts page.
- **Aggressive strategies decay** — the Lab's job is to detect that and retire the dead ones automatically. A system that reliably self-heals already beats most retail trading tools; discovering genuinely new edges is the upside, not the promise.

---

## 8. Appendix

**Cost summary:** ~$100–140/month in Phase 1 (P0–P1), ~$150–215/month once options flow lands in Phase 2 — see §4.10 for the full breakdown and rationale.

**Supporting documents:**
- `IDEA.md` — the complete evolution log, all eight versions, including the competitive landscape research and the reasoning behind every major pivot.
- `FINAL.md` — the working detail this report distills, including the full Treasury rule derivations and cost-decision history.
- `SCOPE.md` — the engineering-level build spec this report's phase breakdown is sourced from.
