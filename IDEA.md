# BullSense — Final Plan

*v7 — 2026-07-06. v6 built the Research OS; v7 redefines the identity from tool-suite to entity, and fixes the end goal (Part 6): **one accountable AI analyst** — autonomous, P&L-accountable via a public paper fund, probability-calibrated, coherent via a Ledger of Beliefs, personal via User Alpha, and interrogable.*

## TL;DR

**BullSense is one accountable AI analyst you hire, not a platform you subscribe to. It works around the clock — scanning, reading filings, arguing bull vs. bear, watching your holdings — and hands you decision-ready situations. You do only the last step: decide. It stakes a public reputation on every call: a live track record, a published paper portfolio, and a calibration curve.**

- A daily **Market Risk Radar** (0–100 regime score) throttles an engine of aggressive **signal families** (hype surges, squeeze setups, momentum breaks, smart-money moves) — every signal ships with cited evidence, a conviction score, and an explicit invalidation price.
- **Dual receipts:** the engine's full live track record is public per strategy (including losses and a strategy graveyard); the user's own results following signals are tracked privately ("you lose 2x when you take Hype signals in RISK-OFF").
- **The Lab** makes it self-learning: strategies are JSON genomes; a nightly loop spawns candidates (mutation + LLM hypotheses), kills ~95% in an anti-overfitting gauntlet, incubates survivors in live shadow, and promotes/retires autonomously. Usage → outcome data → better strategies.
- **Cold start is solved by the Preseason:** the engine runs live for 12+ weeks before public launch, building in public with a daily shareable Radar artifact — launch day opens with a real track record, and paid launch is gated on pre-committed performance thresholds.
- Free (Radar + delayed signals) / Pro $29 / Elite $49. ~$25–50/mo to run, indie-buildable on Vercel + FMP + free sentiment APIs. $10k MRR ≈ 350 subscribers.
- Moats, in order of compounding: the live receipts history (unfakeable, unbackfillable), the day-one alt-data archive, personal receipts lock-in, and the Lab's accumulated experiment corpus.
- **The Research OS layer (Part 5):** an on-demand multi-agent **Analyst Desk** produces cited deep-dive dossiers per ticker (fundamentals, filing forensics, valuation, bull-vs-bear debate → verdict); a **Watchtower** monitors your holdings/watchlist against explicit thesis triggers; everything converges into one surface — the **Decision Queue**: "N situations need your decision today." Dossier verdicts get receipts too.

*Evolution: generic goal-driven screener → aggressive regime-aware signal engine (v2) → full trade-loop platform (v3) → self-learning Lab (v4) → red-teamed: preseason, gates, growth, churn ballast (v5) → Research OS end-state (v6).*

---

## Part 1 — Where the idea stands

Core (from v2): an aggressive, high-risk signal engine with two coupled halves —
- **Market Risk Radar**: daily 0–100 regime score (VIX + term structure, breadth, put/call, SPY trend, credit spreads) → RISK-ON / NEUTRAL / RISK-OFF.
- **Signal families**: 🔥 Hype Surge (social velocity), 🩳 Squeeze Setup (short interest), 🚀 Momentum Breakout, 🕵️ Smart Money (insider clusters, options flow), ⚡ Catalyst — each throttled by regime, each with conviction score, cited "why," and an explicit invalidation price.
- **Receipts**: every signal frozen at creation, scored publicly per family vs. SPY.

## Part 2 — The nearby alternatives (rings around the core)

Explored each adjacent category: what it proves, and whether to absorb, defer, or reject.

### Ring 1: Trading journals — TradeZella ($29–49/mo), Tradervue
The most important discovery in this whole exploration. Traders pay $300–400/year for tools that analyze **their own behavior** — win rates, mistakes, discipline. TradeZella's framing: not "where do I log trades" but "how do I become a better trader." Its AI surfaces things like risk concentration and behavioral patterns.
**What it proves:** the deepest pain isn't finding ideas — it's that traders lose money because of *themselves* (chasing, oversizing, no exits, revenge trading). **→ ABSORB.** This is the missing half of BullSense.

### Ring 2: Strategy automation — Composer (by SoFi, $24/mo), Surmount, Coinrule
No-code strategy building + backtesting + auto-execution. Composer got acquired by SoFi — validation that "strategy as a followable object" is a real product.
**→ DEFER execution (brokerage complexity), ABSORB the framing:** each BullSense signal family *is* a strategy object with a live track record — followable, comparable, eventually paper-tradeable.

### Ring 3: Copy/social trading — eToro, Autopilot, NVSTly
Follow people instead of strategies. Heavy regulatory surface, and "follow this influencer" is exactly the accountability-free culture we're positioned against.
**→ REJECT the copy-people model, ABSORB the light version:** public leaderboards of signal families and (later) user-created scan recipes — you follow *track records*, not personalities.

### Ring 4: Paid signal groups — Discord/Telegram "alerts" communities
Thousands of traders pay $50–150/mo for alert callouts with **zero auditable track record**. This is our most direct — and most beatable — competitor. Same product promise, delivered with receipts instead of screenshots.
**→ This is the go-to-market wedge.** Also absorb the channel: BullSense should *live* in Discord/Telegram as a bot, not only a website.

### Ring 5: Portfolio risk tools
Riskalyze-style "how exposed am I?" analysis. Aggressive traders hold concentrated books and have no idea what a regime flip does to them.
**→ ABSORB as "Portfolio X-Ray":** connect or paste your holdings; the Risk Radar reads *your* book — "72% of your portfolio is high-beta momentum; in the last 5 RISK-OFF flips, this profile drew down 18% avg." Serves the *investor* persona, not just the trader.

### Ring 6: AI research copilots — Fiscal.ai, Perplexity Finance
Great cited Q&A, reactive not proactive. **→ ABSORB cheaply:** a chat layer over *our own* data ("why did this signal fire?", "how has Hype Surge done in RISK-OFF?"). LLM cost is trivial; trust value is high.

### Ring 7: Options flow — Unusual Whales et al.
Beloved by exactly our audience. **→ DEFER to v2** as a data source for the Smart Money family (needs paid data ~$50–100/mo).

## Part 3 — The progressive synthesis: own the loop, not the tip

Line up every tool above and a pattern appears. A real trade has a lifecycle:

```
CONTEXT → IDEA → CONVICTION/SIZE → EXECUTE → EXIT → REVIEW
```

Every existing product serves exactly one stage:
- Context: nobody (CNBC vibes)
- Idea: screeners, signal groups, WSB trackers
- Conviction/size: nobody
- Execute: brokers
- Exit: nobody (hence bag-holding)
- Review: TradeZella (separate $400/yr product, manual)

**The synthesis: BullSense is the loop, minus execution.** Five connected surfaces:

1. **SENSE** — Risk Radar. The daily habit. "How dangerous is today?"
2. **SPOT** — the signal engine. Regime-throttled aggressive ideas with cited evidence.
3. **SIZE** — every signal card carries conviction + invalidation level + regime context, so the *shape* of the trade (where it's wrong, how much conviction) is decided before entry. Generic risk framing, never personalized dollar advice.
4. **TRACK** — one-tap journaling: "I took this trade" (entry auto-filled from the signal). Deliberately shallow vs. TradeZella — zero-friction is the feature.
5. **LEARN** — dual receipts:
   - **Engine receipts** (public): per-family win rate, profit factor, drawdown, regime-split performance. Marketing = honesty.
   - **Personal receipts** (private): *your* results following signals. "You're profitable on Squeeze signals but lose 2x when you take Hype signals in RISK-OFF." "You exit winners 40% before invalidation-based targets."

**Step 5 is the moat.** Signals are commoditizable; a black-box competitor can clone SPOT in a quarter. But personal receipts require the journal, the journal requires the signals, and the longer a user stays, the more the product knows about *their* edge. Switching cost compounds. And it's the piece that genuinely "helps real life": the honest answer to why most aggressive retail traders lose isn't bad ideas — it's untracked behavior.

**The flywheel:** signals → one-tap journal entries → personal insights → retention → more outcome data → better regime/family stats → more credible receipts → more users.

## Part 4 — The Lab: the self-learning layer

The founding requirement: *the more the app is used, the better it gets — it tests new strategies on historical data, promotes what works, retires what doesn't, and keeps discovering, without a human driving it.*

### 4.1 The core design decision: strategies are data, not code

Every signal family becomes a **strategy genome** — a JSON document, not hand-written code:

```json
{
  "id": "squeeze-v7",
  "family": "squeeze",
  "universe": { "cap": "under-10b", "min_volume": 500000 },
  "entry": [
    { "feature": "short_interest_pct_float", "op": ">", "value": 0.22 },
    { "feature": "days_to_cover", "op": ">", "value": 4 },
    { "feature": "price_vs_ma20", "op": "cross_above" },
    { "feature": "rel_volume", "op": ">", "value": 2.5 }
  ],
  "regime_gate": ["risk_on", "neutral"],
  "exit": { "invalidation": "low_20d", "time_stop_days": 30 },
  "lineage": { "parent": "squeeze-v4", "mutation": "raised SI threshold, added rel_volume" }
}
```

One backtest engine executes any genome. That single choice makes strategies **generatable** (an LLM or mutation operator can write JSON), **testable** (one engine, uniform cost model), **comparable** (uniform metrics), and **auditable** (every live signal traces to an exact genome version + its full test history).

### 4.2 The evolution loop (runs autonomously on cron)

```
        ┌─────────── SPAWN ───────────┐
        │  LLM hypothesis generator    │  nightly: propose N candidate genomes
        │  + mutation / crossover      │  (mutate live winners, cross families,
        │  + decay-repair prompts      │   novel hypotheses from research)
        └──────────────┬──────────────┘
                       ▼
        ┌─────────── GAUNTLET ────────┐
        │  walk-forward backtest       │  ~95% of candidates die here.
        │  + anti-overfitting battery  │  That is the system working.
        └──────────────┬──────────────┘
                       ▼
        ┌─────────── INCUBATE ────────┐
        │  live shadow (paper) 4–8 wks │  signals generated & frozen but
        │  scored on data it has       │  not shown to users
        │  NEVER seen                  │
        └──────────────┬──────────────┘
                       ▼
        ┌─────────── LIVE ────────────┐
        │  published to users          │  allocator weights it in the
        │  public receipts accrue      │  ensemble by regime-conditional
        └──────────────┬──────────────┘  live performance
                       ▼
        ┌─────────── PROBATION ───────┐
        │  decay detector trips        │  rolling live metrics fall below
        │  → suppressed, re-tested     │  incubation baseline
        └──────────────┬──────────────┘
                       ▼
             GRAVEYARD (public)
```

**SPAWN — three generators, cheapest first:**
1. *Parameter evolution* (P1): mutate thresholds of live genomes (SI 20%→25%, add a volume filter), crossover between families. Classic genetic search — cheap, safe, immediate.
2. *LLM hypothesis generation* (P2): Claude reads the receipts data ("Hype Surge decays in NEUTRAL regimes; squeeze winners cluster in <$2B caps") plus a library of documented anomalies, and proposes structured novel genomes *with a written hypothesis for why the edge should exist*. Genomes without an economic rationale get a higher evidence bar — mining for patterns without a "why" is how you harvest noise.
3. *Decay repair* (P2): when a live strategy trips probation, the LLM is prompted with its full history and asked to diagnose and propose repaired descendants.

**GAUNTLET — the anti-overfitting battery.** This is 80% of the engineering and 100% of the credibility. A candidate must survive *all* of:
- **Walk-forward testing** — rolled train/test windows; judged only on out-of-sample segments. A final 2-year holdout is *never* used for selection, only for last-gate confirmation.
- **Cost realism** — commissions, slippage scaled to liquidity, fills at next-bar open (never same-bar close). Aggressive small-cap strategies die without this; better in the lab than live.
- **Multiple-testing haircut** — if we test 1,000 genomes a month, dozens will look brilliant by luck. Track the total number ever tested and apply a deflated-Sharpe / higher-bar correction that *rises* as the lab runs more experiments. This is the single most-skipped safeguard in retail quant tools, and skipping it is why they die.
- **Parameter sensitivity** — perturb every threshold ±20%; if the edge vanishes, it was curve-fit. Fragile genomes are rejected even with great backtests.
- **Regime-split honesty** — performance reported per regime; a strategy that only works in RISK-ON is fine *if declared and gated as such*.
- **Minimums** — ≥100 trades out-of-sample, ≥2 regime cycles covered, capacity sanity (no edges that only exist in $5M-volume microcaps).

**INCUBATE** is the un-cheatable gate: 4–8 weeks of live shadow trading on data that didn't exist when the genome was written. Backtests can be fooled; the future can't.

**LIVE + allocator:** the user-facing "signal families" become the *presentation layer* over whichever genomes are currently live. An allocator re-weights conviction scores by regime-conditional live performance, exponentially weighted toward recent — so the app's overall output quality drifts upward as better genomes displace worse ones, without any UX change.

**PROBATION + GRAVEYARD:** decay detection (rolling live profit factor vs. incubation baseline) auto-suppresses fading strategies. Retired genomes go to a **public graveyard page** with their full history and cause of death.

### 4.3 How usage makes it smarter (the self-training feedback loops)

1. **Live receipts → allocator weights** — every published signal's outcome re-trains the ensemble weighting daily. (Automatic, P1.)
2. **Live receipts → generator prompts** — the LLM generator consumes the accumulated performance corpus; more history = sharper hypotheses and better decay diagnoses. (P2.)
3. **User behavior → search prioritization** — TRACK data shows which signal *shapes* users actually take and hold correctly; the lab allocates more search budget to strategy space users can execute. A theoretical edge no one can hold through drawdown is worthless in practice. (P2/P3.)
4. **Day-one data flywheel** — start archiving social-sentiment snapshots, short interest, and regime scores from the first week of P0, even before the lab exists. Historical alt-data is nearly unbuyable; our own archive becomes both the lab's fuel and a moat that competitors can't backfill. **This is the strongest argument for shipping P0 fast.**

### 4.4 What "self-sufficient" honestly means

- The loop runs unattended: nightly SPAWN→GAUNTLET, weekly promotions/demotions, humans only watch the Lab dashboard. First 3 months: human approval gate on promotions (one click), then remove it once the gauntlet has proven calibrated — that's the path to full autonomy, not a day-one leap.
- **Self-healing > self-improving.** Markets adapt; every edge decays. A system that reliably *retires* dead strategies and keeps overall output stable is already beating 90% of signal products. Discovery of genuinely new edges is the upside, not the promise.
- No guarantee of compounding alpha — the honest claim, and the marketable one, is: *"BullSense runs thousands of experiments a month so you don't have to, and shows you every result — including the failures."* The Lab page (live experiment counter, incubation pipeline, graveyard) makes the self-learning system itself a **public, watchable feature**. Nobody in the space shows their strategy graveyard; it converts the machinery into trust.

### 4.5 Engineering notes

- **Backtest engine:** TypeScript over daily bars for a ~3,000-ticker universe, 10 years of OHLCV + fundamentals from FMP cached into Postgres/Parquet-on-Blob. A genome test is seconds of compute; a nightly batch of 200 candidates is minutes. No GPU, no ML training infra — "self-learning" here is evolutionary search + LLM generation + live re-weighting, which is both cheaper and more explainable than fitting neural nets to prices (the approach the academic literature keeps showing fails out-of-sample).
- **Orchestration:** Vercel Cron triggers the nightly run; batches fan out through Vercel Queues / background functions (Fluid Compute, 300s+ per invocation is ample per batch). Genome store, test results, and lineage graph in Neon Postgres.
- **Alt-data archiver:** a P0 cron that snapshots ApeWisdom/Tradestie + FMP short interest daily into our own history tables. Trivial to build, compounding value.

## Part 5 — The Research OS: doing ALL the work up to the last step

The end-state requirement: *the platform does all research regarding trading and investment — the hectic work — and delivers the user to the last step: the decision.*

### 5.1 What "all the research" actually decomposes into

An investor/trader's research burden is five recurring jobs. Map them, and the platform's surfaces fall out:

| Job (the hectic work) | Hours/week manually | BullSense surface |
|---|---|---|
| "What's the market doing? Is it safe?" | ~3 | **Radar** (built in P0) |
| "What's worth looking at right now?" | ~5 | **Scout** — the signal engine (P0) |
| "Is this stock actually good? Read everything." | 4–10 *per stock* | **Analyst Desk** — deep-dive dossiers (new) |
| "Is anything happening to what I own/watch?" | ~5 | **Watchtower** — thesis-trigger monitoring (new) |
| "So… what do I actually do today?" | the anxiety tax | **Decision Queue** — the last-step surface (new) |

Radar and Scout answer *discovery*. The three new surfaces answer *diligence, vigilance, and decision* — that's what upgrades a signal product into a research department.

### 5.2 Analyst Desk — on-demand deep-dive dossiers

Proven architecture to borrow: **TradingAgents** (53k★ open-source framework) showed that a team of specialist LLM agents + an adversarial bull-vs-bear debate materially beats one big prompt; institutional platforms (Brightwave, the PE-diligence agent wave) proved buyers pay for *citation-backed* agent research. We implement the same shape, retail-sized:

**Pipeline per ticker (user requests, or auto-triggered by a high-conviction signal):**
1. **Gather** (parallel, deterministic): 5y fundamentals + estimates (FMP) · latest 10-K/10-Q/8-Ks (SEC EDGAR — free API) · 2 most recent earnings-call transcripts (FMP) · news (last 90d) · insider activity + 13F changes · our own sentiment archive + technicals + regime context.
2. **Specialists** (parallel agents, each returns cited findings):
   - *Fundamentals analyst* — growth, margins, cash conversion, balance-sheet trajectory
   - *Filing forensics* — risk-factor diffs vs. prior year, footnote red flags, accrual quality, dilution, litigation
   - *Narrative analyst* — what management promised vs. delivered across the last 2 calls; guidance language shifts
   - *Technician* — trend, levels, relative strength, volume profile
   - *Skeptic-quant* — short interest, insider selling, valuation vs. history and peers (reverse-DCF: what growth is priced in?)
3. **Debate**: a Bull agent and a Bear agent each write their strongest case *from the specialists' evidence only* (no new claims); one rebuttal round each.
4. **Verdict synthesizer** produces the **Dossier**: company-in-5-bullets · bull case · bear case · what's priced in · catalyst calendar · risk flags · **"what would change our mind"** — 3–5 explicit, machine-checkable thesis triggers (e.g. "gross margin < 42% next quarter", "CFO departs", "SI > 25%") · a stance (Avoid / Watch / Interesting-Long / Interesting-Short) with confidence. Every claim cited to its source document.

**Dossiers get receipts too:** every stance is frozen and scored vs. SPY at 3/6/12 months, publicly, exactly like signals. No other retail research product scores its own write-ups.

**Cost & feasibility:** one dossier ≈ 200–400k tokens across agents ≈ **$1–3 of LLM spend, ~3–5 minutes wall-clock** — meterable, cacheable (refresh on new quarter, not per request). Runs as a durable multi-step job (Vercel Workflow) so a 5-minute pipeline survives restarts. Guard against **look-ahead bias**: dossier agents only ever see point-in-time data already in our archive when back-scoring stances.

### 5.3 Watchtower — vigilance on autopilot

The thesis triggers from dossiers + invalidation levels from signals + a per-holding event feed become one monitoring engine:
- User builds a **Book**: holdings + watchlist (manual entry P2; broker read-only sync later).
- Nightly + intraday sweeps check each name: new 8-K / news / insider cluster / SI spike / earnings within 7 days / **any thesis trigger tripped** / regime flip exposure (X-Ray logic folds in here).
- Output is not a firehose of alerts — it's *triage*: each event is classified by an agent as `FYI / Worth a look / Needs a decision`, with a one-paragraph cited explanation. Only `Needs a decision` interrupts you.

### 5.4 Decision Queue — the last step, as a product surface

The daily home screen. Not a dashboard of charts — a **queue of situations**, each pre-researched to the point where the only remaining work is judgment:

> **3 situations today**
> 1. 🩳 New Squeeze signal: $XYZ, conviction 74, RISK-ON — [evidence · invalidation $8.40 · open dossier]
> 2. ⚠️ Thesis trigger tripped on $ABC (you hold): gross margin printed 40.1% vs. your 42% trigger — [bear case now stronger · dossier updated]
> 3. 📅 $DEF reports tomorrow: 2-minute pre-earnings brief — [what's priced in · last 4 reactions]

Each card ends in explicit user actions: *Track it · Dismiss · Snooze · Request full dossier* — never "buy/sell" buttons. The queue empties; the anxiety tax is gone. **This is the product promise made literal: everything before the decision is done; the decision stays yours** (which is also exactly where the regulatory line wants us).

### 5.5 Always-on by design: BullSense is a daemon, not a tool

A founding principle, stated explicitly: **BullSense is never idle.** It is not a website that computes when visited — it is a continuously running analyst whose work products the website merely displays. The user's question is never "should I go run some research?" but "what did my analyst find while I wasn't looking?"

**The routine lattice (what is running at any given moment):**

| Cadence | Routine | What the analyst is doing |
|---|---|---|
| Hourly (market hours) | Hype sweep | watching social velocity + volume across the universe |
| Nightly | Core pipeline | ingesting the day's data, recomputing the Radar, running signal genomes, marking every open position/signal |
| Nightly | Lab cycle | spawning + gauntlet-testing new strategy candidates (Part 4) |
| Nightly | Watchtower sweep | checking every Book name against filings, insider moves, SI, thesis triggers |
| Event-driven | **Proactive dossiers** | a high-conviction signal or an upcoming earnings date on a Book name *auto-queues* an Analyst Desk run — the deep dive is often already done before the user thinks to ask |
| Daily 6:15pm | Briefing | digest email: what I did, what I found, what needs you |
| Weekly | Housekeeping | universe refresh, data-quality audit, self-health report |

**The Engine Console:** a live status page — every routine with its heartbeat (last run, next run, what it produced), a per-routine toggle, and a master **pause switch**. Turning the engine off is a legitimate user action (vacation, bear-market hibernation); while paused, nothing triggers, but archives keep accruing so the analyst wakes up with no memory gap. The Console doubles as the trust artifact: watching the machine visibly work every hour is what makes "always-active analyst" feel true rather than claimed.

**Why always-on compounds into better results (the user's instinct, made precise):**
1. Continuous archives → point-in-time data no competitor can backfill → better Lab backtests.
2. Continuous signal generation → receipts accrue around the clock → statistical significance arrives months sooner.
3. Continuous monitoring → thesis breaks caught the evening they happen, not the weekend the user checks.
4. Proactive dossiers → zero-latency decisions: by the time a situation reaches the Decision Queue, its research is attached.

### 5.6 What we deliberately still don't do
- No order execution, no broker write-access — the "last step" belongs to the user, at their broker (revisit paper-trading only, in P3, per Part 4).
- No portfolio-specific dollar advice; situations and evidence, identical for every user who holds the name.
- No pretending the Desk is infallible: dossier receipts will show the misses. Same honesty economics as signals — it's the moat, not the risk.

## Part 6 — The redefinition: from a suite of tools to one accountable analyst

*This part re-derives the product from its end goal backward — and upgrades the identity of the whole idea.*

### 6.1 The flaw in the current framing

Everything up to Part 5 describes a **suite**: five surfaces, a lab, a receipts system. Suites are how software companies think; it is not how users experience trust. Users trust *someone* — a person-shaped thing with judgment, memory, and a reputation to lose. The better version of this idea stops being "a platform with features" and becomes **a single analyst entity** whose organs the features are:

| Old framing (tool-shaped) | New framing (entity-shaped) |
|---|---|
| Risk Radar | the analyst's **situational awareness** |
| Scout | its **attention** |
| Analyst Desk | its **deep thought** |
| Watchtower | its **vigilance** |
| Decision Queue | its **conversation with you** |
| The Lab | its **learning** |
| Receipts | its **reputation** |

Same architecture, different soul. And the entity framing unlocks four genuinely new capabilities the suite framing hid.

### 6.2 The end goal, defined precisely

**By the end of year 2, BullSense is one accountable AI analyst that is:**

1. **Autonomous** — runs continuously, discovers and retires its own strategies, researches proactively; a human touches nothing but the pause switch.
2. **Accountable in P&L, not just calls** — it manages a **public paper fund** under its own published rules (regime-sized, conviction-weighted positions from its own signals). One equity curve, live, unfakeable. Per-signal receipts persuade analysts; *a portfolio curve persuades everyone.* This is the ultimate receipt.
3. **Calibrated** — conviction scores are probabilities with a public calibration curve (Brier-scored): *when BullSense says 70, it happens ~70% of the time.* "Trustworthy" stops being an adjective and becomes a measured property. No product in this market has ever shipped a calibration curve.
4. **Coherent** — it maintains a **Ledger of Beliefs**: a living, versioned worldview (current regime read, sector stances, open convictions, confidence on each). Every signal and dossier must be consistent with the ledger or explicitly update it. Belief changes are timestamped and scored like everything else — you can read *what it believes, when it changed its mind, and whether its mind-changes were right*.
5. **Personal** — it knows your book and your behavioral record, and its success metric is **User Alpha**: the measured difference between your results *with* its process vs. your baseline behavior (chasing, oversizing, ignored invalidations). The entity's job is not just to be right — it is to make *you* right more often.
6. **Interrogable** — you can challenge any call ("why this and not NVDA?") and it defends or concedes from its evidence corpus and belief ledger. The bull/bear debate isn't hidden machinery; you can walk into the room.

### 6.3 Working backward from the end goal

Each end-state property, traced to its prerequisite chain:

- **Paper fund** ← needs allocator + position-sizing rules ← needs live signal stream + regime engine ← **P0**
- **Calibration curve** ← needs hundreds of scored conviction calls ← needs the receipts spine running early ← **P0 + preseason** (this is *another* reason the preseason clock is the most valuable asset: calibration needs volume × time)
- **Ledger of Beliefs** ← needs the Radar narrative + dossier stances as structured claims ← **P0 (narratives) + P2 (Desk)**
- **User Alpha** ← needs personal receipts ← needs one-tap TRACK ← **P1**
- **Interrogability** ← needs the belief/evidence corpus ← **P2**, surfaced as the copilot in **P3**
- **Autonomy** ← the Lab, already sequenced **P1→P2**

Every chain terminates at P0 — the plan's foundation survives its third re-derivation unchanged, which is the strongest signal yet that P0 is correct.

**New work injected by this pass (only three items):**
- **P1:** conviction scores logged as explicit probabilities from day one; calibration table accrues silently (publish the curve when n is honest, ~month 6).
- **P2:** Ledger of Beliefs v1 — the Radar narrative and every dossier stance write structured, versioned claims; public "what BullSense believes" page with changelog.
- **P2.5:** **The Paper Fund** — allocator (already in the Lab plan) + published sizing rules + public equity curve page. Launches *after* the launch gate passes, seeded with the same 12-week preseason history.

### 6.4 What this redefinition changes about positioning

- The pitch compresses from five features to one sentence: **"BullSense is the first AI analyst with a public track record, a published portfolio, and a calibration curve — hire it for $29/month."**
- "Hire an analyst" beats "subscribe to a platform" — pricing anchors against a $100k/yr junior analyst, not against $39.50 Finviz.
- The Engine Console, receipts, graveyard, belief ledger, and paper fund stop being separate trust artifacts and become one thing: **the analyst's public reputation** — the moat restated in its final form: *you can clone the code; you cannot clone a two-year-old reputation.*

## Part 7 — The final plan

### Product statement
**BullSense: the first AI analyst with a public reputation — hire it for $29/month.** It watches the market, finds the ideas, reads the filings, argues both sides, guards your book, and shows up every morning with today's decisions — staking a live track record, a published paper portfolio, and a calibration curve on every call. You do only the last step.

### Personas
- **Primary:** aggressive retail trader (the $50–150/mo Discord-signal-group payer) — served by SENSE/SPOT/TRACK/LEARN.
- **Secondary:** self-directed investor with a concentrated book — served by SENSE + Portfolio X-Ray.

### Phases

**P0 — Build the engine (weeks 1–8)** · goal: engine running end-to-end, receipts clock starts
- Risk Radar: daily score, AI narrative, history chart
- 2 signal families: Hype Surge + Squeeze Setup (free/cheap data, unmistakably aggressive)
- Signal cards: conviction, cited why, invalidation, regime context
- Public engine receipts per family
- Daily email digest
- **Alt-data archiver** — daily snapshots of sentiment/short-interest/regime into our own history tables (the Lab's future fuel; see 4.3.4)
- *Stack:* Next.js on Vercel + Vercel Cron, FMP ($19/mo), ApeWisdom/Tradestie (free), Claude via AI Gateway, Neon Postgres, Clerk, Resend. Run cost ≈ $25–50/mo.

**P0.5 — The Preseason (weeks 8–20, overlaps P1 build)** · goal: solve the cold-start paradox
The receipts product cannot launch with an empty receipts page. So the engine goes live *before* the product does:
- Engine runs daily in production, signals frozen and timestamped — a real, live, unfakeable track record accrues for ~3 months while P1 is built
- **Build in public:** the daily Risk Radar auto-generates a shareable artifact (score, delta, one-line AI narrative — "Fear & Greed index, but with receipts and consequences") posted to X/Reddit daily; weekly "preseason report" posts show the accruing signal record, wins AND losses. The transparency *is* the content; the content *is* the distribution.
- Free waitlist sees everything; nothing is paid yet
- **Public launch happens only when two things are true:** ≥12 weeks of live receipts exist, and the success gate below is met

**Success gates (pre-committed, so we can't rationalize later):**
- *Launch gate:* after 12+ weeks of live preseason, at least one signal family shows profit factor ≥ 1.3 with ≥30 closed signals. If not: do not launch paid — iterate genomes in the Lab, extend preseason. (The free Radar + build-in-public continues regardless; it loses nothing by waiting.)
- *Kill/pivot gate:* if after 9 months no family sustains live profit factor > 1, the honest pivot is already inside the product — Risk Radar + Portfolio X-Ray + journaling as a *risk-and-behavior* platform (the TradeZella-adjacent market), dropping signal generation. The receipts discipline makes this pivot data-driven, not emotional.

**P1 — Close the loop (months 3–4)** · goal: retention mechanics
- One-tap trade tracking + personal receipts v1
- Momentum Breakout + Smart Money (insider) families
- Thesis-break / invalidation-hit alerts (email + push)
- Discord + Telegram bot publishing signals (Pro-gated channels) — meet the audience where it lives
- **Lab v1:** genome format + backtest engine + gauntlet; parameter-evolution SPAWN over the live families; allocator re-weighting from live receipts; human-approved promotions
- **Calibration groundwork:** conviction logged as explicit probability on every signal; Brier table accrues silently (curve published ~month 6 when n is honest)

**P2 — The Research OS (months 5–8)** · goal: from signal product to research department
- **Analyst Desk v1:** the multi-agent dossier pipeline (gather → specialists → bull/bear debate → verdict) on Vercel Workflow; EDGAR + transcripts ingestion; dossier receipts (frozen stances, scored at 3/6/12mo)
- **Watchtower v1:** the Book (manual holdings/watchlist), thesis-trigger monitoring, triaged events (`FYI / Worth a look / Needs a decision`)
- **Decision Queue:** becomes the home screen — signals, tripped triggers, and pre-earnings briefs converge into one daily queue of situations
- **Lab v2:** LLM hypothesis generation + decay repair; incubation fully automated; public Lab page; remove human promotion gate once calibrated
- **Ledger of Beliefs v1:** Radar narratives + dossier stances stored as structured, versioned claims; public "what BullSense believes" page with scored changelog
- **The Paper Fund (P2.5, post-launch-gate):** the analyst runs a public paper portfolio under published sizing rules (regime × conviction); live equity curve page — the ultimate receipt

**P3 — Widen and deepen (month 9+)**
- Options-flow data → Smart Money v2 (Elite tier funds the data cost)
- Chat copilot over our own dossiers/signals/receipts corpus
- Portfolio X-Ray folds into Watchtower (regime stress on the Book); broker read-only sync (Plaid/SnapTrade) replaces manual Book entry
- Community scan recipes with public per-recipe track records
- Alpaca paper-trading; licensed alt-data; mobile once web retention proves out
- Real execution only if/when we accept the brokerage/RIA regulatory lift — never before

### Monetization
| Tier | Price | Gets |
|---|---|---|
| Free | $0 | Risk Radar, 24h-delayed signals, engine + dossier receipts, sample dossiers |
| Pro | $29/mo | Real-time signals, alerts, trade tracking + personal receipts, Discord, **10 dossiers/mo**, Watchtower on 10 names |
| Elite | $49/mo | **40 dossiers/mo** (~$1–3 LLM cost each — the meter is the margin), unlimited Watchtower, options flow, chat copilot, API |

Benchmarks: TradeZella $29–49, Trade Ideas $84–167, signal groups $50–150 — $29 undercuts every one while doing more of the loop. Annual = 2 months free. Sanity math: $10k MRR ≈ 350 Pro subscribers — an indie-scale goal reachable from a niche audience, no VC required.

### Growth model (not an afterthought)
1. **Daily Radar artifact** → X/Reddit → free users (the habit hook; costs nothing to consume)
2. **Public receipts + Lab graveyard** → the shareable "no one else shows this" story → trust → Pro conversion (urgency of real-time signals is the paywall)
3. **Discord/Telegram bot** → lives inside the communities that currently pay $50–150/mo for receipt-free alerts → direct displacement wedge
4. **Churn ballast:** aggressive traders churn hard (they blow up and leave the category). Three stabilizers: the Radar is a daily habit that outlives any losing streak; personal receipts data is accumulated value a user abandons by leaving; and the investor persona (Portfolio X-Ray, P2) has structurally lower churn than the trader persona.

### North-star metric
**Weekly active loop-closers** — users who viewed the Radar, took ≥1 signal, and have tracking on. Not signups, not signal views: closed loops predict retention and word-of-mouth.

**End-state metrics (the Part 6 goals, made measurable):** paper-fund equity curve vs. SPY · calibration error (Brier) trending down · median User Alpha > 0 (users measurably better with the analyst than their own baseline). When those three are public and healthy, the product *is* its marketing.

### Honest risks
1. **The receipts cut both ways.** Losing streaks will be public. Mitigation: regime-split stats, probability framing, invalidation discipline; position as "research accelerant with receipts," never "alpha machine."
2. **Regulatory.** Publisher stance: identical published signals for everyone, no individualized dollar advice, no compensation for coverage, loud high-risk disclaimers. One-time securities-lawyer review before charging. Market as "signal engine," never "adviser."
3. **Free-data dependency.** ApeWisdom/Tradestie are small; abstract the provider layer, cache, budget a paid fallback (Adanos).
4. **Scope creep.** The loop is 5 surfaces; P0 ships 2. The phasing *is* the discipline.
5. **Lab-specific: overfitting is the default outcome, not the edge case.** Every shortcut in the gauntlet (skipping the multiple-testing haircut, testing on in-sample data, ignoring slippage) produces strategies that look great and lose money live — publicly, on our receipts page. The gauntlet is non-negotiable engineering, and incubation (live shadow on unseen data) is the gate that can't be gamed.

## Part 8 — REFRAME (final): this is a personal endeavor

*2026-07-06. BullSense is built for ourselves, not for market. This part supersedes the commercial framing wherever they conflict; the architecture stands.*

### 9.1 What the personal frame deletes
Pricing, tiers, growth model, personas, waitlist/landing/OG share cards, delayed-vs-realtime gating, Discord distribution, disclosures-as-legal-shield, "publisher stance" caution. The launch gate survives **as a self-honesty gate** (don't trust the engine's signals with real attention until PF ≥ 1.3 over ≥30 closed live signals); the preseason survives as simply *how the engine starts* — running before trusting.

### 9.2 What the personal frame UNLOCKS (things a product could never do)
1. **Real broker integration, both directions.** Read our actual positions (Watchtower guards real money from day one) and — endgame — execute: paper fund first, then a small real sleeve via Alpaca under hard caps (max position %, max daily loss, regime kill-switch, master pause). Our money, our rules: the entire RIA/advice constraint evaporates.
2. **Truly personalized output.** Position-size suggestions in real dollars against our actual account, tax-lot awareness, "you already have 40% semis exposure" warnings. The generic-situations constraint existed only for regulators.
3. **Ruthless experimentation.** Strategies can be tried, broken, and killed without a public reputation to manage. The Lab becomes the hobby's intellectual core, not a marketing artifact.
4. **Simpler infra.** Single-user auth (no Clerk multi-tenancy), private repo, Telegram bot as the primary interface instead of polished web UI. Same ~$40–70/mo.

### 9.3 What survives untouched — and why
- **The frozen-receipts discipline** — now *anti-self-deception* machinery. Private, but immutable: entry at next open, no edits, suppressed signals scored too. A personal system without frozen receipts becomes a story we tell ourselves.
- **Calibration** — "when my engine says 70, does it happen 70%?" matters *more* when it's our own money.
- **The always-on daemon, the archive, the Lab, P0 as scoped** — all survive their fourth re-derivation.

### 9.4 Value-per-effort audit (personal build order)
| Rank | Piece | Why |
|---|---|---|
| 1 | Radar + daily Telegram briefing | days of effort → immediate daily utility, the habit anchor |
| 2 | Watchtower on our REAL holdings | guards actual money; pulled forward from P2 to right after P0 |
| 3 | Analyst Desk dossiers | $1–3 replaces 4–10 hours of reading; use before every real buy |
| 4 | Scout signals | genuinely uncertain alpha — treat as hypotheses feeding the receipts, not as income |
| 5 | The Lab | the long intellectual game; payoff measured in years |
| 6 | Paper fund → small real-money autopilot | only after calibration + gate earn it |

### 9.5 Personal-frame risks (replacing the commercial risk table)
1. **Abandonment** is the #1 risk — not competition. Mitigation: the briefing habit ships first; the system talks to us daily whether or not we open a dashboard.
2. **Self-deception** — no public eyes means fudging is easy. Mitigation: receipts immutability is non-negotiable code, not policy.
3. **Over-engineering** — building product polish nobody (including us) needs. Mitigation: Telegram > web pages; every feature must earn its place in the daily loop.
4. **Real-money autopilot too early** — the one genuinely dangerous failure mode. Hard rule: paper fund ≥ 6 months + calibration curve honest before a single real dollar is automated.

### 9.6 The quiet optionality
Personal use *is* a preseason. If after a year the receipts, calibration curve, and paper fund are healthy, the entire v7 commercial plan sits on the shelf ready — with a founding story no competitor can fake: "we built it for ourselves and here is every call it ever made." If they're not healthy, we still own: our hours back (Radar/Watchtower/Desk), a market education (watching calibrated beliefs evolve), and an unbackfillable point-in-time dataset. **In the personal frame, the project cannot really fail — it can only teach.**

## Part 8B — THE MANDATE BROADENING (v9): from signal engine to complete investment desk

*2026-07-14. Operator direction, verbatim intent: BullSense's target is not one aggressive setup — it is an investment platform that analyzes the market and guides stock investment AND scalping. It must answer: which stocks have good potential · how the market is · whether to invest in this stock · what the lot size should be · what the stop loss should be · what the target should be. "BullSense has to have the complete coverage of an expert stock market investor." FINAL.md v5 is the supersession; this entry is the log.*

### 10.1 What v9 changes
1. **Identity:** "aggressive regime-aware signal engine" → **a complete investment desk**: advisor (the six-question contract), supervisor (Watchtower + behavioral guards over our real book), and scorekeeper (receipts) — one entity, full coverage.
2. **Two horizons, never blended:** INVEST (days–months; the current engine, ~80% built) and SCALP (intraday; 0% built, gated hardest). Separate books, separate receipts, separate trust clocks — a scalp that "becomes an investment" is structurally refused.
3. **Home market:** India/NSE first (the money is INR; Cupid is the founding story); the US engine continues as the free, live proving ground for the machinery.

### 10.2 What v9 does NOT change
The Treasury, the receipts immutability, the calibration discipline, the Lab, the guardrails, the trust gates — all survive intact and now govern *both* horizons. The system that exists is the INVEST horizon's engine; nothing is thrown away. A clarification for the record: the engine never shorted stocks — the squeeze family *buys* heavily-shorted names betting on the rebound. v9 broadens the hunting ground; it does not reverse a direction.

### 10.3 The honest gaps v9 opens (the new work, in order)
1. **Advisor Card (A1):** compose the six answers into one artifact per stock — most fields already exist; the new build is a horizon-aware *potential verdict* for any priceable ticker.
2. **India data + India-native families (A2):** no FINRA equivalent exists for NSE — so no transplanted squeeze strategy. Wire delivery %, F&O open interest, bulk/block deals; breed India-native genomes (delivery-surge, OI-buildup, momentum-breakout) through the same anti-overfitting gauntlet; benchmark the personal book against NIFTY, not SPY.
3. **Scalp Desk (A3, gated on A2):** real-time intraday data + a persistent worker (GitHub Actions cannot do this) + scalp genomes — paper-only until PF ≥ 1.3 over ≥100 scalps net of intraday friction, with a max-daily-loss breaker and trades-per-day cap. Scalping is the highest-failure retail activity that exists; it gets the tightest leash in the whole system or it doesn't get built.

## Part 9 — Sources
- Journals: https://www.tradezella.com/vs/tradervue · https://www.stockbrokers.com/review/tools/tradezella · https://traderssecondbrain.com/guides/tradezella-vs-tradervue
- Automation/copy: https://www.composer.trade/ · https://opentools.ai/tools/composer-trade · https://surmount.ai/blogs/composer-vs-surmount-which-automated-trading-platform-is-best-for-you
- Sentiment data: https://apewisdom.io/api/ · https://tradestie.com/apps/reddit/api/ · https://adanos.org/reddit-stock-sentiment · https://altindex.com/wallstreetbets
- Pickers/screeners: https://danelfin.com/ · https://www.wallstreetzen.com/blog/best-ai-stock-picker/ · https://www.wallstreetzen.com/blog/best-ai-stock-screener/
- Copilots: https://fiscal.ai/ · https://www.perplexity.ai/finance
- Failure modes: https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1696423/full · https://www.sciencedirect.com/science/article/pii/S2590291124000615
- Data APIs: https://www.nb-data.com/p/best-financial-data-apis-in-2026 · https://qveris.ai/guides/best-financial-data-api-developers-2026/
- Agentic research: https://github.com/TauricResearch/TradingAgents · https://github.com/georgezouq/awesome-ai-in-finance · https://www.thirdbridge.com/en-us/about-us/media/perspectives/ai-tools-investment-research · https://arxiv.org/pdf/2601.13770 (look-ahead bias in point-in-time LLMs)
- Filings/transcripts: https://www.sec.gov/search-filings/edgar-application-programming-interfaces (free) · https://sec-api.io/ · https://api.kscope.io/
