# BullSense — Dashboard UI Brief

*Context for designing the web dashboard (the "OS hub"). Everything here maps to real data already flowing in Supabase. Telegram stays as the notification channel; this dashboard becomes the primary control surface.*

---

## 1. What this product is (one paragraph for the designer)

BullSense is a personal, always-on AI trading analyst run by 3 people (Sahid, Ansh, Jatin). An automated engine watches the US market, scores market risk daily, hunts for aggressive trade signals (short-squeeze setups, social-hype surges), sizes every position by formula, and keeps an immutable scorecard of every call. The dashboard is where the operators *see the analyst's work and act on it* — the last human step (decide) stays with them. It should feel like a **trading terminal crossed with a calm ops dashboard**: dense with real numbers, but with a clear "what needs my attention today" at the top.

## 2. Who uses it

3 operators, each with their own money profile (independent equity, positions, P&L) PLUS a shared read-only view of the **Engine Paper Fund** (the strategy's own track record, independent of any human). A profile switcher (Sahid / Ansh / Jatin / Engine) is a top-level control. Auth: email + password with OTP verification.

## 3. The screens (information architecture)

### 3.1 Command Center (home) — "what needs me today"
The daily decision queue. Top of the app. Answers: *is the market safe, what's new, what needs a decision.*
- **Market Radar dial** — today's 0–100 score + regime badge (RISK-ON 🟢 / NEUTRAL 🟡 / RISK-OFF 🔴) + the AI's 2-sentence "what changed today" narrative.
- **Decision queue** — a list of situations: new signals fired, watchtower alerts on holdings (invalidation hit / time stop / near stop), pre-earnings flags. Each is a card ending in an action (Track it · Dismiss · Open dossier). Empty state: "All clear. N positions guarded, engine running."
- **At-a-glance stat row** — engine equity + today's Δ, your equity + today's Δ, open positions, trust-clock progress (n/30 signals).

### 3.2 Radar
- **Score history line chart** (regime score over time, colored by regime band; RISK-OFF periods shaded).
- **Component breakdown** — 5 gauges/bars: VIX level, VIX term structure, breadth, index trend, credit stress (each 0–100, higher = calmer).
- **Narrative timeline** — the daily "what changed" notes, newest first.
- Data: `regime_scores` (date, score, regime, components jsonb, narrative).

### 3.3 Signals (the Scout's output)
- **Feed of signal cards**, filterable by family (🩳 Squeeze / 🔥 Hype), regime, status (open / closed_win / closed_loss / suppressed).
- **Each signal card:** ticker, family icon, conviction 0–100 (as a meter), 3 cited evidence bullets (e.g. "days-to-cover 12.4, 4.2M shares short, price crossed 20-day avg on 2.1× volume"), the AI thesis paragraph, invalidation price, time stop, regime badge, and **live mark-to-market** (return % vs SPY since entry). Suppressed signals shown greyed with a "counter-regime" tag.
- Detail view: full price context, the frozen thesis, mark-to-market history.
- Data: `signals`, `signal_marks`, `genomes`.

### 3.4 Receipts / Performance — **the centerpiece**
The public scorecard. This is what makes BullSense trustworthy.
- **Engine equity curve** — the paper fund's equity over time vs a SPY benchmark line. Big, prominent. Data: `treasury_state` (profile_id='engine').
- **Per-family stats table** — win rate, profit factor, avg win / avg loss, max drawdown, count — split by regime. Data: aggregated `signals` + `signal_marks`.
- **Trust clock** — progress toward "30 closed signals at PF ≥ 1.3" per family (the gate before signals are trusted with real attention). A progress bar.
- **Calibration chart** — conviction band (40–55, 55–65, 65–75, 75–100) → actual win rate. Ideal = diagonal (win rate rises with conviction). Data: `calibrationBuckets`.
- **Strategy graveyard** (future/Lab) — retired genomes with cause of death.

### 3.5 My Book (per profile)
- **Holdings** — each position: symbol, qty, cost, current price, P&L, and its **stop/invalidation** with distance-to-stop; a ⚠️ if no stop set. Data: `book`, `positions`.
- **Watchtower events feed** — triaged (FYI / worth a look / needs a decision) alerts on your names. Data: `book_events`.
- **Position Intake** — a form to log a position bought outside the system (symbol, qty, cost, stop) → returns the Treasury size-check verdict (within formula / oversized N×). Mirrors the `/add` command.

### 3.6 My Performance (per profile) — User Alpha
- **Your equity curve** vs the Engine's (the gap = do you add or subtract value by your choices).
- **Your trades** — the positions you `/took`, with outcomes.
- **Your calibration** and **override receipts** — "when you sized off the Treasury's suggestion, did it help or hurt?" A running scored total per override type (oversized / undersized). Data: `overrides` (outcome_pnl), `positions`, `treasury_state`.

### 3.7 Engine Console (ops)
- **Routine heartbeats** — each of nightly / hype-sweep / briefing / weekly: last run, next run, last output summary, enabled toggle. Data: `routines`.
- **Job health** — recent runs, error count, durations. Data: `job_runs`.
- **Master pause switch.** Data: `routines.master_paused`.

## 4. The data you can render (real tables, already populated)

| Table | Holds | Powers |
|---|---|---|
| `regime_scores` | daily score, regime, 5 components, AI narrative | Radar |
| `signals` + `signal_marks` | frozen signal cards + daily mark-to-market vs SPY | Signals, Receipts |
| `genomes` | the strategies (JSON rule-sets) | Signals, Lab |
| `treasury_state` | per-profile daily equity, peak, drawdown, heat | all equity curves |
| `positions` | per-profile trades, entry, qty, realized P&L | My Book, My Performance |
| `overrides` | sizing deviations vs Treasury + scored outcome | User Alpha |
| `book` / `book_events` | holdings/watchlist + triaged Watchtower alerts | My Book, Command Center |
| `sentiment_snapshots` | social mention archive | Hype signal context |
| `short_interest` | FINRA short-interest archive | Squeeze signal context |
| `job_runs` / `routines` | engine health + routine heartbeats | Engine Console |
| `profiles` | the 3 operators + engine fund; per-profile risk prefs | profile switcher |

## 5. Design direction (from the product's own SCOPE)

- **Feel:** dark, dense, terminal-adjacent — a modern Bloomberg/quant-desk vibe, not a consumer fintech app. Calm, not flashy. Numbers are the hero.
- **Two visual signatures:** the **Radar dial** (a gauge, RISK-ON/NEUTRAL/RISK-OFF) and the **signal card**. Get these two right and the app has identity.
- **Semantic color, disciplined:** green = profit/RISK-ON, amber = neutral/caution, red = loss/RISK-OFF/invalidation. One accent beyond those (the brand). Don't let the accent fight the semantic colors.
- **Information hierarchy:** the Command Center's "what needs me" must read in 2 seconds; deep tables (receipts, calibration) reward study. Summary before detail on every screen.
- **Honesty is the aesthetic** — losses shown as plainly as wins, the trust clock shows "not there yet," the calibration chart can look bad. This candor IS the brand; the design should present it confidently, not hide it.
- **Charts:** equity curves (with benchmark line), the score-history line, calibration scatter/bars, conviction meters, small sparklines in tables. Give them real care — area fills, faint grids, emphasized endpoints.
- **Tabular numbers** everywhere figures align. Monospace for tickers/prices/codes.

## 6. Interactions worth designing well

- **Profile switcher** (Sahid/Ansh/Jatin/Engine) — global, top-level.
- **Signal card → action** (Track it / Dismiss / open detail).
- **Position Intake form** with the live Treasury verdict.
- **Set/edit a stop** inline on a holding.
- **Pause/resume** the engine (with confirm).
- Empty states that teach (e.g. "No signals yet — the engine is selective. Hype baseline fills in ~4 days.").

## 7. What NOT to build (scope guardrails)

- No buy/sell execution buttons — the last step is manual, at the broker. The app informs; it never trades.
- No public/marketing pages — this is a private operator tool (3 users).
- Nothing that requires data we don't have — everything renders from §4.

## 8. Tech context (for whoever wires it up)

- **Stack:** Next.js (App Router) on Vercel. Data in Supabase Postgres (already live).
- **Auth:** Supabase Auth, email + password + OTP. RLS policies gate each operator to their own money-layer rows (`positions`, `book`, `overrides`, `treasury_state` where profile is theirs) while the engine/market tables (`regime_scores`, `signals`, `genomes`, receipts) are shared-readable to authed operators.
- The read/query patterns already exist in `src/providers/store.ts` (REST) and can be reused server-side.
