# BullSense — Project Scope: Objective → Features → Approach

*v4 — 2026-07-14. Companion to FINAL.md (the definitive plan, now v5) and IDEA.md (the evolution log, now v9). v4 records the mandate broadening: BullSense is a complete investment desk — advisor (six-question contract: market read · potential · enter/avoid · lot size · stop · target), supervisor, and scorekeeper — operating on two never-blended horizons (INVEST days–months, built; SCALP intraday, gated and unbuilt), India/NSE first with the US engine as the proving ground. See FINAL.md §1, §2A, §2B; everything below remains the P0 engineering spec for the engine that exists.*

---

## 1. Objective

**Build a personal, always-on AI investment desk that produces structured, risk-controlled profit in investing and — once separately earned — intraday scalping: it analyzes the market, tells us which stocks have potential and whether to enter, computes the exact lot size, stop loss, and target for every idea, supervises our real holdings, and enforces capital discipline no human sticks to consistently under pressure.**

Two failure modes this objective explicitly rejects:
- Shipping a research tool that's interesting but never provably profitable (research-quality without profit-quality).
- Chasing profit without discipline, which is how aggressive personal trading normally ends.

**Success criteria — measurable, checked at fixed intervals, not vibes:**

| # | Criterion | Bar | Checked |
|---|---|---|---|
| 1 | Operational reliability | System runs unattended with <5% job failure rate | ongoing, via `job_runs` |
| 2 | Statistical edge (self-honesty gate) | ≥1 signal family clears profit factor ≥1.3, **net of modeled friction**, over ≥30 closed live signals | continuously, from week 8 |
| 3 | Risk-adjusted performance | Paper fund shows positive Sharpe/Sortino vs. a SPY+T-bill blend over ≥6 months, including at least one real drawdown | month 8+ |
| 4 | Behavioral honesty | Override receipts give a clear, uncomfortable-if-necessary answer on whether manual intervention helps or hurts | month 8+ |
| 5 | Capital discipline | Zero instances of a position sized outside the Treasury formula, ever | continuous, enforced in code |

**Real money is gated on 2 + 3 + 4 all passing — never on ambition, never sooner.** This is Guardrail 3 from FINAL.md, restated as an acceptance test.

## 2. Features — what ships, organized by organ

Each organ from FINAL.md §2 becomes a feature set. Priority: **P0** (must, weeks 1–8) · **P1** (should, months 3–4) · **P2** (could, months 5–8) · **P3** (later, month 9+).

| Organ | Feature | Priority | Serves the objective by |
|---|---|---|---|
| **RDR** Radar | Daily 0–100 regime score + 5y backfill + hysteresis + AI narrative | P0 | Gives every downstream decision market context — the throttle everything else obeys |
| **CAP** Treasury | Fixed-fractional position sizing + portfolio heat cap, applied to the paper fund from its first simulated trade | P0 | Directly the objective's "structured" half — without this, signals are just opinions |
| **SCT** Scout | Hype Surge + Squeeze Setup genomes, signal cards with cited evidence + invalidation price | P0 | The idea-generation engine; deliberately only 2 families to keep the receipts clock honest early |
| **RCP** Receipts | Immutable signal freeze, net-of-friction stats, regime-split performance, Engine Console | P0 | The anti-self-deception spine everything else depends on |
| **WTC** Watchtower | Real-holdings Book, nightly sweep, triaged Telegram alerts | P0 (pulled forward) | Protects actual money before any signal logic is trusted |
| **WTC** Position Intake ("rescue mode") | Import a position bought *outside* the system → BullSense retroactively builds the missing trade plan: thesis, invalidation price, time stop, and a Treasury size-check verdict ("this position is N× what the formula allows") | P0 | Real trades happen outside the system (see the Cupid case, 2026-07-08); an unplanned position is exactly when discipline is needed most |
| **DCQ** Decision Queue | Daily Telegram briefing: Radar + new signals + Watchtower events | P0 | The actual daily interface — the loop closes here or it doesn't close |
| **CAP** Treasury — regime/drawdown scaling | Exposure ceiling shrinks with regime; drawdown throttle halves/pauses sizing | P1 | Closes the "hot streak → blowup" gap identified in the structured-profit audit |
| **DSK** Analyst Desk | FMP-fed specialist agents → bull/bear debate → cited verdict + thesis triggers | P1 | Replaces hours of manual filing/transcript reading with a 5-minute agentic pass |
| Personal tracking | One-tap TRACK, personal receipts, calibration table | P1 | Foundation for User Alpha and the calibration curve |
| **CAP** Treasury — override receipts | Every manual override logged and scored like a signal | P1 | Closes the loop on our own discretion, with real numbers |
| **LAB v0** The Lab (lightweight) | Genome format + backtest engine; monthly parameter mutation + walk-forward re-validation of the two *live* genomes only (no new-genome invention yet) | **P1, pulled forward** | Continuous improvement starts month 3, not month 5 — a static rule set is treated as a bug |
| **LAB v1→v2** The Lab (full) | LLM-generated new-genome hypotheses, anti-overfitting gauntlet, live shadow incubation, autonomous promote/retire, public graveyard — fitness judged at the **portfolio** level, not per-genome | P2 | The self-learning core reaches full strength — discovers new edges, not just re-tunes old ones |
| **CAP** Treasury — conviction escalation | Fractional-Kelly sizing tier, earned per-genome once it has ≥50 closed signals, a validated calibration curve, and net PF ≥ 1.3; capped, and still governed by the heat cap and drawdown throttle | P2 | Lets a genuinely excellent, proven opportunity get a genuinely larger position — mechanically, never by feel |
| Ledger of Beliefs | Versioned worldview from Radar narratives + dossier stances | P2 | Coherence — lets us audit *when* and *why* the analyst changed its mind |
| Paper fund | Full CAGR/drawdown/Sharpe reporting against the Treasury's live rules | P2 | The actual acceptance test for real money (§1, criterion 3) |
| Chat interrogation | Ask the Desk/Lab "why" over Telegram | P2 | Interrogability — makes the reasoning corpus usable, not just archived |
| Real-money sleeve | Small live allocation via Alpaca, under full Treasury caps | P3 — only if §1 criteria 2–4 pass | The actual payoff, gated deliberately behind proof |
| Options-defined-risk instruments | Debit spreads for Hype/Squeeze instead of raw stock | P3 | Caps downside to a known number even through a gap — a genuine risk upgrade, not a cost decision |

**Explicitly cut, permanently, not just deferred** (this was commercial-product chrome that never served the objective): public waitlist, marketing landing page, OG share cards, Discord bot, multi-tenant auth, Stripe/billing, disclosures-as-legal-shield. This is a personal tool; none of that does anything for structured profit.

## 3. How — architecture and approach

### 3.1 Stack (per FINAL.md v3 cost philosophy — best value, not lowest cost)

```
GitHub Actions (cron)  ──►  job scripts (Node/TS)
                               │
      ┌────────────────────────┼─────────────────────────┐
      ▼                        ▼                          ▼
   FMP API              Paid sentiment vendor        Claude API
 (bars, fundamentals,    (Hype family feed,           (tiered: Haiku routine /
  filings, SI, insider,   selected weeks 6–8)          Sonnet+ judgment calls —
  transcripts, calendar)                               Desk debates, Lab hypotheses)
      │                        │                          │
      └──────────────► Neon Postgres (state) ◄────────────┘
                        Cloudflare R2 + DuckDB (bulk history, Lab backtests)
                               │
                  Vercel Hobby (Next.js dashboard, reads only)
                               │
                        Telegram bot (primary interface: briefings,
                        alerts, decision queue, chat interrogation)
```

- **FMP is the default data source from week 1** — not an upgrade trigger. One reliable API for bars, fundamentals, filings, short interest, insider trades, transcripts, and calendars, instead of hand-parsing EDGAR + FINRA ourselves.
- All external data still flows through a `providers/` abstraction — swapping the sentiment vendor, or adding options-flow data later, is one adapter, not a rewrite.
- Jobs are idempotent and keyed by trading date — a rerun never double-writes signals or snapshots.
- Every job run logged to `job_runs` — feeds the Engine Console and the reliability metric (§1, criterion 1).
- **Always-on principle unchanged:** a `routines` table (enabled, last_run, next_run, last_summary) plus a master `paused` flag. Paused = no new signals/alerts fire; archiver routines keep running regardless — the analyst sleeps, its memory doesn't.

### 3.2 Universe

US common stocks (NYSE/NASDAQ/AMEX): price ≥ $1, market cap ≥ $100M, 20-day avg dollar volume ≥ $2M. ≈3,000 tickers, refreshed weekly via FMP's screener endpoint. ETFs excluded except the regime set (SPY, QQQ, IWM, HYG, LQD).

### 3.3 Data model (Neon Postgres)

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
profiles           (id PK, name, telegram_chat_id, equity, currency, broker, risk_prefs jsonb)
                    -- 2026-07-08: three independent operators (Sahid, Ansh, Jatin). The ENGINE
                    -- (Radar, Scout, Lab, engine receipts) is shared; the MONEY layer (book,
                    -- positions, treasury, overrides, personal receipts, briefings) is per-profile.
book               (profile_id FK, symbol, exchange [US|NSE], kind [holding|watchlist], qty, cost_basis, added_at)
book_events        (id, profile_id FK, symbol, kind, detected_at, triage [fyi|look|decide], summary, source_ref)
positions          (id PK, profile_id FK, signal_id FK NULL, symbol, side, qty, entry_price, entry_at,
                    risk_budget_pct, invalidation_price, status, closed_at, realized_pnl)  -- Treasury-sized
treasury_state     (profile_id FK, date, equity, peak_equity, drawdown_pct, heat_pct, regime,
                    sizing_multiplier, PK(profile_id, date))
overrides          (id PK, profile_id FK, position_id FK, override_type, system_recommendation,
                    actual_action, rationale, outcome_pnl)                          -- override receipts
job_runs           (id, job, trading_date, status, started_at, ms, meta jsonb)
routines           (name PK, enabled, master_paused, last_run_at, next_run_at, last_summary)
```

New since the structured-profit revision: `book`/`book_events` (Watchtower), `positions`/`treasury_state` (the Treasury's sizing and drawdown-throttle state), `overrides` (override receipts). Signals still reference a genome id + version even though P0 genomes are hand-written — when the Lab arrives in P2, nothing migrates.

### 3.4 Risk Radar (unchanged from prior spec, still correct)

Five weighted components (VIX level 20%, VIX term structure 15%, breadth 25%, index trend 25%, credit stress 15%), each normalized against 3-year percentile history, mapped to RISK-ON (≥65) / NEUTRAL (40–64) / RISK-OFF (<40), with 2-consecutive-close hysteresis to prevent flicker. 5-year backfill at build time. Narrative generated once per day by Claude, frozen.

### 3.5 Launch signal genomes (P0)

**hype-surge-v1** (hourly, market hours): mentions_24h ≥30, mention_velocity ≥3.0×, bullish_ratio ≥0.60, rel_volume ≥2.0, day_change_pct ≥2.0 (price must confirm — never front-run chatter). Regime-gated to RISK-ON/NEUTRAL. Invalidation: trigger-day low or -8%. Time stop: 10 sessions.

**squeeze-setup-v1** (nightly): si_pct_float ≥0.20, days_to_cover ≥4, close crosses above MA20, rel_volume ≥1.5, si_age_days ≤21 (stale SI = no signal). Regime-gated to RISK-ON/NEUTRAL. Invalidation: 20-day low or -10%. Time stop: 30 sessions.

Both produce a signal card: ticker, conviction 0–100, three cited evidence bullets, a Claude-written thesis with risk flags, invalidation price, time stop, regime badge — and now also **the Treasury-computed position size** for the paper fund, shown alongside conviction rather than replacing it.

### 3.6 Receipts methodology (unchanged principle, tightened per the structured-profit audit)

Entry price = next regular-session open (never the trigger price). Marked daily vs. SPY. Closed by invalidation touch, time stop, or 60-session horizon. Per-family stats now computed **net of modeled commissions, slippage, and short-term capital-gains tax drag** (FINAL.md §3A rule 5) — this is a change from the original gross-fills version. Suppressed (regime-gated-out) signals are frozen and scored too, to prove the regime gate earns its keep.

### 3.7 Job lattice (GitHub Actions, ET)

| Schedule | Job | Work |
|---|---|---|
| Hourly, 10:00–16:00 Mon–Fri | `hype-sweep` | pull sentiment → archive → run hype genome → size via Treasury → new signals + theses → Telegram alert if fired |
| 17:30 Mon–Fri | `nightly` | ingest bars → refresh ma_cache → compute Radar + narrative → run squeeze genome → mark/close open positions → update treasury_state (drawdown check) → Watchtower sweep on Book |
| 18:15 Mon–Fri | `briefing` | Telegram digest: Radar score + delta + narrative, new signals, Watchtower events, receipts snapshot |
| Sun 12:00 | `weekly` | universe refresh, data-quality audit, job_runs health report |

### 3.8 Interfaces

| Surface | Content | Notes |
|---|---|---|
| Telegram bot | Daily briefing, real-time alerts (signal fired, invalidation hit, Watchtower "needs a decision"), chat interrogation (P2) | **Primary interface** — replaces email entirely |
| `/radar` | Score history, component breakdown, narratives | Vercel Hobby, read-only |
| `/signals` | Live feed of signal cards (no delay — it's ours) | |
| `/receipts` | Per-family stats, regime-split, equity curves, calibration table | |
| `/engine` | Engine Console: routine heartbeats, toggles, master pause | |
| `/treasury` | Portfolio heat, drawdown state, position sizing log, override log | New — the Treasury's own dashboard |
| `/methodology` | Radar formula, genome rules, receipts rules, Treasury formula — verbatim | |

No landing page, no waitlist, no auth beyond a single-user token — there's one user.

### 3.9 Accounts & env needed before week 1

| Service | Plan | Env |
|---|---|---|
| FMP | Premium/Growth tier — confirm exact tier covers fundamentals + SI + insider (+transcripts for P1) | `FMP_API_KEY` |
| Alpaca | Free market data + paper trading account | `ALPACA_API_KEY`, `ALPACA_SECRET` |
| Neon | Free tier to start | `DATABASE_URL` |
| Cloudflare R2 | Free tier (10GB) | `R2_*` |
| Telegram | Bot via BotFather | `TELEGRAM_BOT_TOKEN` |
| Anthropic / AI Gateway | Pay-as-you-go, tiered model routing | `AI_GATEWAY_API_KEY` |
| Sentiment vendor | Selected weeks 6–8 (compare 2–3 providers) | TBD |

### 3.10 Milestones (8 weeks to P0 complete, evenings-scale)

| Wk | Deliverable | Proof it works |
|---|---|---|
| 1 | Repo, schema, providers layer, FMP wired in, universe + 10y bar backfill | 3,000 tickers, ~7.5M bar rows, spot-checked against FMP directly |
| 2 | Radar compute + 5y backfill + hysteresis + `/radar` | Known selloffs (e.g. Aug-24, Apr-25) land as RISK-OFF on backfilled history |
| 3 | Sentiment vendor selected + archiver + hype genome + Treasury v0 (fixed-fractional sizing) | A week of live snapshots; dry-run signals carry sane, formula-computed sizes |
| 4 | Squeeze genome + signal cards + Claude thesis + Telegram alerts | End-to-end: trigger → sized card → Telegram push |
| 5 | Outcome scorer (net-of-friction) + `/receipts` + `/methodology` | Marks match manual calc on 10 sampled signals |
| 6 | Watchtower (Book + nightly sweep + triaged alerts) | A seeded test event (e.g. a real recent 8-K) triages correctly |
| 7 | `/treasury` dashboard + override logging + `/engine` | Portfolio heat and drawdown state visible and correct against hand-calc |
| 8 | Hardening: idempotency tests, alerting on job failure, full daily briefing | A killed mid-run job reruns clean; pause verifiably stops signals while archiver continues; **the trust clock (§1, criterion 2) starts** |

**End of week 8 = the trust clock starts**, not a "launch" — there's no audience to launch to. It's simply the point past which we start trusting the system's own signals, per Guardrail 2's 30-closed-signal, net-of-friction bar.

## 4. Defaults chosen (flag now if wrong)

1. ~~US equities only for P0~~ **Revised 2026-07-08: we actually trade NSE (India) — see the Cupid case.** The Watchtower/Book and Position Intake must support NSE tickers from P0 (yfinance `.NS` suffixes work; FMP's India coverage is partial — verify per-endpoint in week 1). The Scout's signal universe can stay US-first while the *protection* layer covers wherever our real money actually is.
2. FMP tier confirmed and purchased in week 1, not deferred.
3. Telegram is the only interface that matters day-to-day; the web dashboard exists for deep dives, not daily use.
4. No real money moves until §1's criteria 2, 3, and 4 all pass — this is enforced as an actual code gate on the execution path, not a policy we promise to remember.
5. Options-defined-risk instruments and options-flow data are real P3 considerations, not commitments — revisit once the Scout/Treasury combination has a live track record worth protecting with capped-risk structures.
