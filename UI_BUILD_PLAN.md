# BullSense — Dashboard Build Plan (reconciled)

*Companion to [UI_BRIEF.md](UI_BRIEF.md). The brief says what to build; this says what
the project can actually back **today**, where the brief and reality diverge, and in
what order to build so nothing renders a promise the data can't keep.*

Reconciled against: `db/schema.sql`, `src/providers/store.ts` (the real query layer),
`supabase/functions/telegram-webhook`, and `FOUNDATION_AUDIT.md`.

---

## ★ MVP — the testable slice (build this first)

*Narrower than the full vision in §A–D below: a **private, deployed dashboard that's just
enough to check and exercise every feature from a browser instead of the terminal — with
the **Test Lab** (run the engine on any ticker, no CLI) as screen #1.* Not the 7-screen
product; the smallest thing the three of us can actually use to test the platform. The full
plan below stays the north star.

### M0. What's in the MVP (and what's deferred)

| In the MVP | Why | Per-user auth? |
|---|---|---|
| **Test Lab** — run the bench on any ticker | the whole point; least data-dependent (computes on demand) | **no** — read-only, writes nothing |
| **Radar** (read-only) | one signature visual; populated nightly | no |
| **Signals feed** (read-only) | the other signature visual; squeeze live | no |
| **Engine Console** (read-only) | job health + heartbeats; fully populated | no |
| **My Book** (light) — *optional 1b* | to test the money layer + Position Intake | **yes** — per-operator |
| Receipts · My Performance · Beliefs · Graveyard | data still accruing / needs audit H4 | deferred to §C |

The first four screens read shared engine/market tables and write nothing → they need **no
per-user isolation**. That's what lets the Test Lab ship first behind one lightweight gate.

### M1. Test Lab — the one genuinely new build

**Refactor first (no-drift discipline).** `src/jobs/bench.ts` is CLI-shaped (`process.argv`,
`line()` printing, `process.exit`, `loadEnvFile`). Extract a **pure core** that returns data,
not console text:

```
runBench(params: { symbol, dtc?, equity?, years?, profileId? })
  → { symbol, priceMeta, regime, gateOpen, dtc, dtcSource,
      trades: TradeDetail[], stats, liveDecision, rightNow, notes[] }
```

- the existing CLI becomes a thin renderer over `runBench` (same terminal output — prove it);
- the dashboard server action is a **second thin caller** of the same `runBench`;
- one engine, two front-ends — the same pattern as the `backtestSqueeze` sink. **Do not**
  shell out to `tsx`.

**Data path — read the archive, not live FINRA (this avoids the serverless timeout).**
- the live `fetchLatestShortInterest()` pages through *up to 20,000 FINRA rows* to find one
  symbol — fine for a manual CLI run, a real timeout/latency risk on a Vercel function hit on
  every "Run" click;
- instead read `days_to_cover` from the **already-archived `short_interest` table** — one
  indexed query (the `/ask` webhook already does this). *Verified populated: 4,338 rows /
  2,250 symbols, latest settlement 2026-06-30; GME = 10.75 DTC, matching the live value.*
  Same SI the nightly scout uses → **more faithful and instant**;
- **fallback ladder:** archived SI for the symbol → else the user's manual `dtc` input → else
  (NSE / no data) the honest "engine can't evaluate — US only" panel.

**Server + security.**
- runs as a Next.js **route handler / server action**; the compute (~750 bars × ~70 windows)
  is milliseconds — all latency was the FINRA page-through, now removed;
- **hard rule:** `SUPABASE_SECRET_KEY` lives only in server code — never a `NEXT_PUBLIC_` var,
  never a client component (carries D3 forward).

**Screen.** Ticker input + optional `dtc` / `years` / profile selector + Run. Results:
regime+gate banner · the replay trade table · the stats row (win rate / PF / avg / excess vs
SPY) · the live-decision card · the "right now" verdict · the stated DTC-constant assumption.
First-class loading and honest empty/failure states.

### M2. Auth for the MVP — DECIDED: none for now

**Operator decision (2026-07-14):** *"build an early UI so we can test the working of the
current engine. We can add the security later. Right now we just need a platform that acts as
an intermediate for us to test our data."*

So the MVP ships **with no auth** — a private testing/inspection tool. Consequences to hold:
- **`SUPABASE_SECRET_KEY` still stays server-only** (never `NEXT_PUBLIC_`, never a client
  component). No-auth means no login, *not* leaking the god key to the browser — all data
  goes through server components / route handlers.
- Keep the deploy **unindexed** (`X-Robots-Tag: noindex`) and treat the URL as unlisted.
- Money-layer screens (My Book) still get built **profile-scoped** so they're correct per
  operator, just not access-controlled yet.
- **Security is a named fast-follow phase**, not dropped: shared/again per-operator email+OTP
  + RLS land once the platform has proven useful. Tracked, deferred — not forgotten.

### M3. MVP build order

0. **Scaffold** — Next.js App Router on Vercel · no auth (per M2) · server-only Supabase
   client (secret key) · the two shared components (Radar dial, signal card).
1. **`runBench` refactor** + CLI re-pointed at it (prove no-drift: CLI output unchanged). ← *do first; framework-independent*
2. **Test Lab screen** — server action → `runBench` → results view. *The deliverable that matters most.*
3. **Read-only screens** — Engine Console → Radar → Signals (all populated today).
4. **(optional 1b)** **My Book** + Position Intake, money queries server-scoped by profile (still no access control).

Everything past this = the full plan (§C) + the deferred **security phase** (email+OTP + RLS).

---

## A. Capability inventory — screen → real data → query that exists → populated?

| Screen (brief §) | Backing tables | Query already in store.ts | Populated today? |
|---|---|---|---|
| **Test Lab (NEW, MVP #1)** | live prices + `short_interest` + `genomes` + `regime_scores` | `runBench()` core (to extract from `bench.ts`) + `getLatestRegime`, `getLiveGenomes` | ✅ **on demand** — computes live, needs no accrued history |
| Radar (3.2) | `regime_scores` | `getLatestRegime`, `getRecentRegimes` | ✅ nightly |
| Signals (3.3) | `signals`, `signal_marks`, `genomes` | `getOpenSignals`, `getLiveGenomes`, marks | ✅ squeeze live; **Hype empty** (no live hype genome) |
| Command Center (3.1) | `regime_scores` + `signals` + `book_events` | above + `insertBookEvent` reads | 🟡 partial (decision queue thin early) |
| My Book (3.5) | `book`, `book_events`, `positions` | `getBook`, `recentEventCount`, `getOpenPositions` | ✅ via `/add`, watchtower |
| Engine Console (3.7) | `routines`, `job_runs` | `getJobHealth`, routine reads | ✅ every run |
| Receipts (3.4) **centerpiece** | `treasury_state`, `signals`+`signal_marks`, `fund_metrics`, `benchmark` | `getEquitySeries`, `getBenchmarkSeries`, `calibrationBuckets`, `latestFundMetrics` | 🔴 **mostly empty for weeks–months** (see D5) |
| My Performance / User Alpha (3.6) | `positions`, `overrides`, `treasury_state` | `personalReceipts`, `scoreOverrideForPosition` | 🔴 sparse (needs `/took` + closed trades) |
| Beliefs (brief/webhook) | `beliefs` | `recordBelief` | 🟡 sparse |
| Graveyard (3.4 future) | `genome_graveyard` | `insertGraveyard`, `cumulativeVariantsTested` | 🔴 empty until Lab runs |

The query layer is genuinely reusable server-side (REST via `store.ts`), which is the
brief's stated plan (§8) — that part checks out.

---

## B. Discrepancies found (brief/plan vs. reality) — with resolution

### D1. `db/schema.sql` is stale — it does NOT define tables the code already uses
The canonical schema is "v1" and is missing: `dossiers`, `dossier_requests`,
`fund_metrics`, `benchmark`, `genome_graveyard`, `beliefs`, `config`, `lab_experiments`
— all read/written by `store.ts` and the webhook. It also omits `profiles.is_operator`
(the webhook's auth gate) and the `engine` and `test` profile rows everything assumes.
**Impact:** anyone building the UI off `schema.sql` sees a false picture.
**Resolve:** regenerate `schema.sql` from the live Supabase DB (or add the missing DDL)
**before** UI work — the dashboard's data contract must be truthful. *Prerequisite.*

### D2. There is NO auth and NO RLS yet
The brief (§8) says "RLS policies gate each operator to their own money rows." None
exist in `schema.sql` — no Supabase Auth, no policies. The dashboard is multi-operator
(3 people, each seeing only their own money layer) so this is load-bearing, not optional.
**Resolve:** treat auth+RLS as **Phase 0 infrastructure**: Supabase Auth (email+OTP),
RLS on `positions`/`book`/`overrides`/`treasury_state`/`book_events` keyed to the
operator's profile, engine/market tables shared-read to authed users. Nothing per-operator
ships before this.

### D3. `store.ts` uses the SECRET key — it bypasses RLS entirely
Every query uses `SUPABASE_SECRET_KEY` (god key). Correct for the jobs; **wrong to reuse
verbatim in a per-user dashboard**, because it would hand every operator every operator's
data regardless of RLS.
**Resolve:** the dashboard needs a separate data path — Supabase Auth per-user + the
anon/publishable key so RLS applies, OR server components that explicitly scope every
money-layer query by the authenticated `profile_id`. Decide this at Phase 0 (it drives
D2). Reuse `store.ts` **only** for engine/market (shared-read) tables.

### D4. Currency & benchmark mismatch — the book is INR/NSE, the benchmark is SPY (USD)
`profiles.currency` defaults **INR**, `book.exchange` defaults **NSE**, real money is
India (SCOPE revision, the Cupid case). But every equity curve benchmarks against **SPY**
(USD). Comparing an INR equity curve to a USD index is apples-to-oranges.
**Resolve:** (a) render all money in INR with `.NS` tickers; (b) for the *personal* books,
benchmark against an India index (NIFTY) or drop the benchmark line; keep SPY only on the
**Engine** paper fund (which trades the US signal universe). Flag this on the Receipts screen.

### D5. The centerpiece screen is empty at launch
Receipts = calibration + trust clock + fund metrics + equity curve. All of it needs data
that only accrues with **time**: `calibrationBuckets` needs *closed* signals; the trust
clock targets **30 closed signals**; `fund_metrics` needs ~10 days of engine equity; the
Lab graveyard needs a Lab run. For the first weeks the flagship renders empty states.
**Resolve:** **sequence Receipts LAST.** Lead with screens that are data-rich on day one
(Radar, Signals, Engine Console, My Book). Design the empty states as first-class (the
brief already asks for this) — "trust clock: 0/30, the honesty is the point."

### D6. Hype signals may not appear
Only a live **squeeze** genome is confirmed (`getLiveGenomes("squeeze")`). The Signals
screen's 🔥 Hype filter is empty until a hype genome is promoted live and `hype-sweep`
has sentiment history.
**Resolve:** ship the Signals feed family-agnostic; the Hype filter simply shows its empty
state until the family goes live. No blocker.

### D7. Receipts will render numbers the audit is still fixing
The engine equity curve (the big prominent chart) is affected by open audit item **H4**
(survivorship: unpriceable/delisted positions marked flat at cost → curve overstated).
**Resolve:** land H4 before Receipts goes live, or annotate the curve as provisional.
"Honesty is the aesthetic" (brief §5) — don't ship a confident curve built on an
overstated number.

---

## C. Build plan (ordered so data-readiness and dependencies line up)

**Phase 0 — Foundation (no screens).** Resolves D1–D4.
1. Regenerate `db/schema.sql` from live DB (truthful data contract).
2. Supabase Auth (email+password+OTP) + RLS policies per operator (D2).
3. Pick the data path: per-user auth key vs. server-scoped queries (D3).
4. Next.js App Router scaffold on Vercel; server components; the two design signatures
   (Radar dial, signal card) as the first shared components.

**Phase 1 — The data-rich screens (ship first; everything here is populated today).**
5. **Engine Console** — `routines` + `job_runs`. Simplest, fully populated, high daily value.
6. **Radar** — `regime_scores`. One of the two signature visuals; data flows nightly.
7. **Signals feed** — `signals`+`signal_marks`+`genomes`. The other signature visual.
8. **My Book** — `book`/`book_events`/`positions` + Position-Intake form mirroring `/add`
   (reuse `intakeVerdict` from `treasury.ts`). INR/`.NS` aware (D4).
9. **Command Center** — compose Radar summary + new signals + book_events into the
   "what needs me" queue.

**Phase 2 — Receipts / Performance (after data accrues + H4 lands).** Resolves D5, D7.
10. Engine equity curve vs SPY (Engine only, per D4) — after H4.
11. Per-family + regime-split stats, trust clock, `calibrationBuckets` chart.

**Phase 3 — User Alpha & the reflective layer (sparsest data, build last).**
12. My Performance: your curve vs engine, your trades, `overrides` scored (User Alpha).
13. Beliefs timeline (`beliefs`), Strategy Graveyard (`genome_graveyard`, once Lab runs).

---

## D. One-line honest summary
The brief is buildable and well-mapped, but **not "no discrepancies" as written**: the
schema doc is stale (D1), the multi-operator security model isn't built (D2/D3), the book
is INR-vs-SPY (D4), and the flagship screen is empty until data and the audit catch up
(D5/D7). Do Phase 0 first, ship the data-rich screens, and sequence Receipts last. Then it
truly uses every real capability with nothing faked.
