# BullSense — The Final Project Idea

*v4 — 2026-07-07. This document supersedes where it conflicts. IDEA.md is the evolution log (v1→v8); SCOPE.md is the P0 engineering spec (stack section superseded by §4 below). v2 added §3A: the goal restated as structured profit, plus the Treasury (capital/risk governance). v3 revised the cost philosophy to best-value-per-dollar. v4 makes the goal hierarchy explicit (profit is terminal; everything else is instrumental), pulls the Lab's continuous-learning loop forward so improvement compounds from month 3 instead of month 5, and adds an earned sizing escalation (§3A Rule 6) so a genuinely excellent, proven opportunity gets a genuinely larger position — mechanically, not emotionally.*

---

## 0. The goal, stated without euphemism

**Profit is the terminal goal. Everything else — receipts, calibration, coherence, interrogability — is instrumental machinery that exists only to make the profit real and repeatable rather than lucky.** They are not co-equal objectives; they are load-bearing scaffolding for the one that matters. A perfectly calibrated analyst that loses money in a disciplined, well-documented way has still failed at the one thing that counts.

Two things follow directly from taking that seriously, both new in this revision:

1. **The system must keep getting better the longer it runs — starting early, not eventually.** A static rule set that never adapts is not "structured profit," it's a strategy with an expiration date. The Lab's continuous-learning loop is therefore pulled forward (§6) instead of waiting until month 5.
2. **When a genuinely excellent, well-evidenced opportunity appears, the system must be able to excel at it** — size it meaningfully larger than a mediocre one — without that ever becoming sizing-by-feel. §3A Rule 6 makes that escalation earned and formulaic.

## 1. What BullSense is

**BullSense is our personal, always-on AI analyst.** Not a product, not a platform — a single accountable entity that works for us around the clock and hands us only the last step of investing: the decision.

It is:
- **Autonomous** — runs continuously on scheduled routines; we touch nothing but the pause switch
- **Accountable** — every call it ever makes is frozen at creation and scored against the market forever; it runs a paper portfolio under its own published rules
- **Calibrated** — its conviction scores are probabilities we can audit ("when it says 70, is it right ~70% of the time?")
- **Coherent** — it maintains a versioned Ledger of Beliefs; you can read what it believes and when it changed its mind
- **Personal** — it watches *our real holdings*, sizes in *our real dollars*, and measures whether it makes *us* better (User Alpha)
- **Interrogable** — challenge any call; it defends or concedes from cited evidence
- **Cost-disciplined** — engineered for best features per dollar, not lowest possible dollar: ~$100–180/month, spent deliberately (§4)

## 2. The analyst's anatomy

| Organ | Surface | What it does |
|---|---|---|
| Situational awareness | **Radar** | daily 0–100 market risk score (VIX + term structure, breadth, trend, credit) → RISK-ON/NEUTRAL/RISK-OFF, with hysteresis; throttles everything downstream |
| Attention | **Scout** | aggressive signal families (hype velocity, squeeze setups, momentum breaks, insider clusters), each a versioned JSON genome with conviction, cited evidence, and an explicit invalidation price |
| Deep thought | **Analyst Desk** | multi-agent dossiers: specialists (fundamentals, filing forensics, promise-vs-delivery, technicals, skeptic-quant) → bull-vs-bear debate → cited verdict with machine-checkable "what would change our mind" triggers |
| Vigilance | **Watchtower** | our real book monitored nightly against thesis triggers, filings, insider moves, SI spikes, earnings dates → triaged as FYI / Worth a look / Needs a decision |
| Conversation | **Decision Queue** (via Telegram) | the daily briefing: "N situations need your decision" — each researched down to pure judgment |
| Learning | **The Lab** | continuous improvement in two speeds — **v0** (from P1): parameter mutation + rolling walk-forward re-validation of the genomes already live, so existing strategies keep getting re-tuned against fresh data every month rather than sitting static; **v1→v2** (from P2): full evolution — LLM-generated new genome hypotheses, the anti-overfitting gauntlet (walk-forward, cost realism, multiple-testing haircut, sensitivity), live shadow incubation, autonomous promote/retire, public graveyard. Fitness is judged at the **portfolio** level (does this genome improve the fund's net risk-adjusted profit), not just per-genome stats — a genome that's individually fine but redundant with a better one is pruned |
| Reputation | **Receipts** | immutable: entry = next open, suppressed signals scored too, per-family & regime-split stats, Brier calibration table, paper-fund equity curve |
| **Capital discipline** | **The Treasury** | the missing governor: converts every idea into a *sized, capped, regime-scaled* position — see §3A |

## 3A. The Treasury — capital and risk governance (the profit layer)

Every prior organ produces *ideas*. None of them, by themselves, produce *profit* — that depends entirely on how much is risked, how positions interact, and what happens after a loss. The Treasury sits between Scout/Desk and any actual dollars (paper or real) and enforces five rules mechanically, never by feel:

**1. Fixed-fractional position sizing, not conviction-vibes sizing.**
Every position size is computed, never chosen:
```
risk_budget = account_equity × per_trade_risk%      (0.5%–1.5%, conviction scales within this band only)
position_size = risk_budget / (entry_price − invalidation_price)
```
Conviction never overrides this formula — it only moves *where in the 0.5–1.5% band* a trade sits. A "sure thing" and a "maybe" differ by at most 3x in size, never by 20x. This is the single highest-leverage fix: it is exactly the discipline retail traders lack, and exactly what turns "good signals" into "good outcomes."

**2. Portfolio heat cap.**
Sum the risk budget of every *open* position (not capital deployed — risk actually at stake to each invalidation level). Cap the total at ~15–20% of equity at any moment, with a same-sector/theme sub-cap (e.g., no more than 2 correlated hype names open simultaneously). This is what stops six unrelated-looking signals from secretly being one concentrated bet.

**3. Regime scales exposure, not just entries.**
Earlier versions had Radar gate *new* signals by regime but left existing positions untouched. Fixed: a RISK-OFF flip also shrinks the portfolio heat ceiling itself — e.g., RISK-ON allows the full 20%, NEUTRAL 12%, RISK-OFF 5%. If a regime flip finds us over the new ceiling, the Treasury forces a partial de-risk of the weakest-conviction open names, not just a freeze on new ones.

**4. A drawdown throttle — the rule that stops a hot streak from becoming a blowup.**
Symmetric with regime throttling, but driven by *our own* results: if the paper (later real) equity curve draws down more than a pre-set threshold from its peak (e.g., 10%), position sizing is cut in half until a new equity high is approached; past a second, deeper threshold (e.g., 18%), the Treasury forces a full pause pending manual review. This is the single most common way disciplined systems still blow up — over-levering after a winning streak — and it's the one failure mode with no natural check anywhere else in the design.

**5. Expectancy net of friction, not gross backtest expectancy.**
Every family's receipts (§Receipts) must report win rate and profit factor **after** modeled commissions, realistic slippage, and short-term-capital-gains tax drag — not idealized fills. A genome only earns live promotion (Lab gauntlet) or real-money graduation (Guardrail 3) if its *net* expectancy is positive. A strategy that's profitable only on paper-perfect fills is not a strategy; it's a rounding error waiting to happen.

**6. Earned conviction escalation — how the system excels at a real opportunity, without ever sizing by feel.**
Rule 1's 0.5–1.5% band is deliberately conservative *by default* — but a flat band that never distinguishes a 95-confidence, well-evidenced setup from a 60-confidence one isn't excellence, it's just caution. The fix is a second, higher sizing tier that a genome/family must *earn* before it's allowed to use it:

- **Eligibility:** a genome graduates from flat sizing to the escalation tier only once it has a validated calibration curve (≥50 closed live signals, Brier score under a set threshold) *and* clears Guardrail 2's net-PF ≥ 1.3 bar. Unproven genomes stay on flat sizing, permanently, until they earn otherwise.
- **The formula (fractional Kelly, never full Kelly):**
```
kelly_fraction   = (b·p − q) / b        where b = net avg_win/avg_loss, p = calibrated win probability, q = 1 − p
position_risk%   = clamp(kelly_fraction × kelly_multiplier, per_trade_risk_min, escalated_max)
```
  using a conservative fraction (¼–½ Kelly — full Kelly is well known to be too high-variance to run) and an escalated ceiling (e.g., up to ~3% per trade for the best-proven setups, versus the flat 1.5% ceiling everything else uses).
- **Still governed by Rules 2 and 4.** Escalation changes *how large a single earned trade can be* — it never raises the portfolio heat cap or bypasses the drawdown throttle. A great trade can be bigger; the whole book still can't get more dangerous.
- **The result:** the system's best, most rigorously proven ideas get meaningfully more capital than its merely-decent ones — mechanically, from a formula fed by real calibration data, never from conviction, mood, or "this one feels different."

**Override receipts — closing the loop on our own discretion.**
Any time we manually override the Treasury or Scout (skip an invalidation exit, oversize a "sure thing," ignore a Watchtower flag), that override is logged and scored exactly like a signal — entry, outcome, and a running "override P&L" separate from "followed-the-system P&L." This is User Alpha with teeth: after six months we'll have a real, uncomfortable answer to "does overriding the machine make us richer or poorer," instead of a vague feeling either way.

**The success bar is risk-adjusted, not just "beats a coin flip."**
Guardrail 2 (PF ≥ 1.3 over 30 signals) is a necessary statistical floor, not the actual target. The real bar, tracked on the paper fund from month one: **CAGR, max drawdown, and Sharpe/Sortino**, benchmarked against a blend of SPY and the risk-free rate — because an aggressive strategy has to earn its risk premium, not just edge out a passive index. Real capital (§3, Guardrail 3) only follows the paper fund once it clears this bar over a full 6+ month window that includes at least one drawdown.

**Considered, not committed — defined-risk options as the instrument for aggressive signals (P3+).**
For the deliberately aggressive families (Hype, Squeeze), a small defined-risk options structure (e.g., a debit call spread sized to a fixed dollar loss) is structurally superior to a full-size stock position for "structured" risk: the downside is capped to a known number regardless of a gap-through-the-stop, which a hard stop-loss on stock cannot guarantee. Flagged as a real upgrade path once options data/execution is justified (Guardrail 5) — not a day-one requirement, since it adds data and execution complexity the frugal build should defer.

**Tax and account-type awareness.**
A structured-profit goal realized in a taxable account faces a materially different after-tax hurdle than one in a tax-advantaged account (short-term gains taxed as ordinary income). This must be decided *before* Guardrail 3 graduates any strategy to real money, not discovered afterward — the Treasury's net-of-friction expectancy calculation (rule 5) should use the correct account's tax assumption from the start.

## 3. Non-negotiable guardrails (written as rules, kept as code)

1. **Receipts immutability is code, not policy** — no edits after freeze, ever. This is anti-self-deception machinery.
2. **Self-honesty gate:** the Scout's signals earn real attention only after PF ≥ 1.3 (net of friction, §3A rule 5) across ≥30 closed live signals.
3. **Real-money autopilot** only after the paper fund clears the risk-adjusted bar (§3A) over ≥6 months including a real drawdown, AND the calibration curve is honest — and then only a small sleeve under the Treasury's hard caps (position sizing, portfolio heat, drawdown throttle, regime kill-switch, master pause).
4. **Every feature must earn its place in the daily loop** — if it isn't consumed weekly, it gets deleted.
5. **Spend where it buys real quality; skip spend that duplicates something already-free and already-excellent** (§4) — the goal is best features per dollar, not lowest possible dollar.
6. **No position is ever sized by feel** — every dollar amount, paper or real, is computed by the Treasury's formula (§3A rule 1 or, once earned, rule 6), full stop.
7. **Escalated sizing is earned, never assumed** — a genome only gets access to §3A rule 6's larger sizing tier after its own live calibration and net profit factor prove it deserves the upgrade. Every genome starts, and stays, on flat sizing until it earns otherwise.
8. **The system must never stop learning** — the Lab's continuous-tuning loop starts in P1 (§7), not P2, and runs for as long as the project runs. A static rule set is treated as a bug, not a finished state.

## 4. The cost-optimized architecture (~$100–180/month, best-value not cheapest-possible)

*Revised philosophy: earlier drafts treated every dollar as something to avoid. That's wrong for this goal — "structured profit" is best served by paying for real reliability and depth wherever it improves signal or research quality, and staying free only where free is genuinely the best option, not merely the cheapest one.* Two different reasons a line item costs $0 below: either it's free **and** the best tool for the job (no compromise), or it's a place we're deliberately not paying yet because nothing would consume the upgrade (sequencing, not frugality).

| Need | Choice | Cost | Why |
|---|---|---|---|
| Scheduled jobs (Radar, Scout, Watchtower, Lab) | **GitHub Actions**, private repo | **$0** | Genuinely the best fit for this job size — 2,000 free min/mo covers our ~800/mo lattice with room to spare. Paying for a scheduler here would buy nothing. |
| Dashboard | **Vercel Hobby** (Next.js) | **$0** | A read-only dashboard over the DB doesn't need paid compute. |
| State DB | **Neon**, free tier → paid the moment it's warranted | **$0–19/mo** | Start free; upgrade without hesitation once table size or query load actually wants it — no reason to pre-pay for headroom we don't need yet. |
| Bulk history (10y bars, sentiment/SI archive) | **Cloudflare R2 + DuckDB** in jobs | **$0–5/mo** | 10GB free tier comfortably covers years of daily bars; trivial overage if we exceed it. Already the *better* engine for Lab backtests, not just the cheaper one. |
| Prices | **Alpaca** market data | **$0** (upgrade only if intraday precision earns its keep) | Free tier is genuinely sufficient for daily/hourly-cadence signals. This isn't a corner cut — paying Polygon's $99/mo here would buy latency we don't need at this trading cadence. |
| **Fundamentals, filings, short interest, insider trades, earnings transcripts** | **FMP Premium/Growth — bought from day one** | **~$29–59/mo** | The clear best-value call in the whole stack: one reliable, maintained, versioned API instead of us hand-parsing EDGAR full-text search, FINRA's bi-monthly files, and Form 4s ourselves. This directly improves the Analyst Desk and Watchtower — buy it immediately rather than waiting for pain. |
| **Social sentiment** | A maintained paid social/Reddit-analytics API, layered over (or replacing) the free ApeWisdom/Tradestie feeds | **~$20–35/mo** *(confirm exact vendor pricing at build time)* | The Scout's Hype family is only as good as this feed. Free hobby APIs can vanish or degrade with no notice — since an entire signal family's edge depends on this data, it's exactly the kind of dependency worth paying to de-risk. |
| **Options flow** | Unusual Whales or similar, once the Smart Money family exists and would use it | **~$50–75/mo** | Sequenced to when there's a strategy built to consume it — not a frugality gate, just not paying for data with nothing reading it yet. Bring forward from "someday" to "next phase after P0." |
| Interface (briefings, alerts, decision queue, chat) | **Telegram bot** | **$0** | The right interface for an always-on personal analyst on its own merits — not a cost-saving substitute for a web app. |
| Auth | Single-user token | **$0** | Correct regardless of budget — there's one user. |
| Domain | A real domain, not `*.vercel.app` | **~$1/mo** | Small, and worth it for something we're keeping long-term. |
| **LLM** | Claude, tiered deliberately — see below | **~$25–60/mo** | The one line item where spending *more*, in the right place, directly buys better decisions. |

**LLM allocation — spend where it compounds into better strategies, not evenly across everything:**
- **Haiku** for the genuinely routine ~70–80% of calls: nightly narratives, Watchtower triage, evidence formatting.
- **A stronger, judgment-tier model (Sonnet-class or above) deliberately funded** for the calls where quality of thought directly drives outcomes: the Analyst Desk's specialist analyses and bull/bear debate, and the Lab's hypothesis generation and decay diagnosis. This is where "spend to get the best features" pays for itself most directly — a sharper bear case or a better strategy hypothesis is worth far more than the few extra cents it costs over Haiku.
- **Batch API (50% off)** still used for everything that can run overnight — this is efficient engineering, not corner-cutting; there's no reason to pay full price for work with no latency requirement.
- **Prompt caching** on repeated filing/methodology context — same logic.
- Dossiers remain event-driven (triggered by real signals or Book events) and cached per quarter — not because of cost, but because an ambient dossier for a stock nobody's looking at isn't useful regardless of price.

**Realistic monthly total: ~$100–140 in Phase 1 (P0–P1); ~$150–215 once options flow is added in Phase 2.** Compare to the ~$5–15/mo of the prior all-free draft on one side, and $1,000+/mo for a Bloomberg-adjacent professional terminal stack on the other — this sits deliberately in between: real data quality, a genuinely capable research engine, and LLM spend allocated to where it improves judgment, without paying for enterprise-scale infrastructure a one-person project doesn't need.

## 5. Where the remaining spend decisions get made (sequenced, not gated by frugality)

| Decision point | Choice | Cost | Timing |
|---|---|---|---|
| FMP tier selection (fundamentals+SI+insider vs. + transcripts) | Confirm exact tier against FMP's current pricing page before purchase | $29–59/mo | Week 1, before the Analyst Desk needs it |
| Sentiment vendor selection | Compare 2–3 paid providers for reliability/coverage vs. cost | $20–35/mo | Weeks 6–8, alongside the Hype genome build |
| GH Actions minutes exceed free tier as the Lab grows heavy | Keep Actions; add a small VPS for overflow batches | $5–10/mo | Only if/when it happens — this one genuinely is demand-driven |
| Watchtower wants true real-time on Book names | Alpaca websocket — already included, no extra spend | $0 | Engineering task, not a purchase |
| Smart Money family ships and needs options flow | Unusual Whales or comparable | $50–75/mo | Phase 2, right after the family is built — not gated behind unrelated proof |

## 6. Build order (personal value-per-effort, final)

1. **Weeks 1–3 — The heartbeat:** repo, GH Actions lattice, R2/DuckDB + Neon storage, bar backfill, FMP purchased and wired in as the primary data source, **Radar + nightly Telegram briefing**. From week 3, BullSense talks to us every evening. The habit anchor and the archive both start here — on real, reliable data from day one.
2. **Weeks 4–5 — The bodyguard:** the Book (our real holdings), **Watchtower** sweeps + triaged Telegram alerts. It now protects real money.
3. **Weeks 6–8 — The hunter:** Hype Surge + Squeeze genomes (paid sentiment vendor selected and integrated), signal cards with theses, **receipts spine + Engine Console** — receipts computed net-of-friction from day one (§3A rule 5). The self-honesty clock (30 closed signals) starts. **Treasury v0** ships alongside: fixed-fractional sizing + portfolio heat cap applied to the paper fund from its very first simulated trade — sizing discipline is never bolted on later.
4. **Months 3–4 — The scholar (+ the first turn of the crank):** **Analyst Desk v1** (FMP-fed specialists — filings, fundamentals, transcripts — debate, verdict, thesis triggers wired into Watchtower), dossier receipts, one-tap TRACK + personal receipts, calibration table accruing. **Lab v0 ships in the same window, not later:** monthly parameter mutation + walk-forward re-validation of the two live genomes against the freshest data — the system is now demonstrably improving itself three months in, instead of five.
5. **Months 5–8 — The mind:** **Lab v1→v2** (full LLM-hypothesis generation, new-genome invention, the anti-overfitting gauntlet, live incubation, autonomous promote/retire, public graveyard — fitness judged at the portfolio level), **Ledger of Beliefs**, full paper fund with public-to-us equity curve **and CAGR/drawdown/Sharpe reporting** (§3A), chat interrogation via Telegram, **override receipts** live. **Conviction escalation (§3A Rule 6) goes live the moment any genome earns it** — ≥50 closed signals with a validated calibration curve and net PF ≥ 1.3 — rather than waiting for a fixed calendar date.
6. **Month 9+ — The hands (only if earned):** small real-money sleeve via Alpaca under Guardrail 3's full Treasury caps. And the quiet optionality: a healthy year of receipts + calibration + risk-adjusted fund performance means the commercial plan (IDEA.md v7) reactivates any time we choose, with an unfakeable founding story.

## 7. The one-sentence version

**BullSense: a self-improving AI analyst we own outright, built for one goal — structured profit. It watches the market and our money around the clock, reads everything on real institutional-grade data, argues with itself, keeps getting measurably better the longer it runs, sizes every position by formula instead of feeling — bigger on its best, hardest-earned ideas, never on a whim — and keeps an immutable scorecard of every call, including our own overrides. For a small fraction of what a single junior analyst costs, it leaves us exactly one job: the decision.**
