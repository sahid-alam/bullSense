-- BullSense schema v1 (Neon Postgres)
-- Shared ENGINE tables + per-profile MONEY tables (Sahid / Ansh / Jatin).

create table if not exists profiles (
  id            text primary key,              -- 'sahid' | 'ansh' | 'jatin'
  name          text not null,
  telegram_chat_id text,                       -- filled when each person messages the bot
  equity        numeric not null,              -- account equity in `currency`
  currency      text not null default 'INR',
  broker        text,                          -- 'groww' | 'zerodha' | 'upstox' | ...
  -- 2026-07-09: band raised from 0.5–1.5% to 1.0–2.5% per founder decision (aggressive book).
  -- Earned escalation (Rule 6) can lift a PROVEN genome to ~4%. Per-profile overridable.
  risk_prefs    jsonb not null default '{
    "per_trade_risk_min": 0.010,
    "per_trade_risk_max": 0.025,
    "heat_cap_risk_on": 0.20,
    "heat_cap_neutral": 0.12,
    "heat_cap_risk_off": 0.05,
    "dd_throttle_half": 0.10,
    "dd_throttle_pause": 0.18,
    "max_position_pct": 0.25
  }'::jsonb
);

-- ===== shared engine =====

create table if not exists tickers (
  symbol        text primary key,
  exchange      text not null default 'US',    -- 'US' | 'NSE'
  name          text,
  sector        text,
  mcap          numeric,
  is_active     boolean not null default true
);

create table if not exists daily_bars (
  symbol        text not null,
  date          date not null,
  o numeric, h numeric, l numeric, c numeric,
  volume        bigint,
  primary key (symbol, date)
);

create table if not exists ma_cache (
  symbol        text not null,
  date          date not null,
  ma20 numeric, ma50 numeric, ma200 numeric,
  rel_volume    numeric,
  high_52w      numeric,
  low_20d       numeric,
  primary key (symbol, date)
);

create table if not exists sentiment_snapshots (
  symbol        text not null,
  captured_at   timestamptz not null,
  source        text not null,
  mentions_24h  integer,
  rank          integer,
  bullish_ratio numeric,
  primary key (symbol, captured_at, source)
);

create table if not exists short_interest (
  symbol          text not null,
  settlement_date date not null,
  si_shares       bigint,
  si_pct_float    numeric,
  days_to_cover   numeric,
  primary key (symbol, settlement_date)
);

create table if not exists regime_scores (
  date          date primary key,
  score         numeric not null,
  regime        text not null,                 -- 'risk_on' | 'neutral' | 'risk_off'
  components    jsonb not null,
  narrative     text,
  prev_score    numeric
);

create table if not exists genomes (
  id            text primary key,              -- e.g. 'squeeze-v1'
  family        text not null,
  version       integer not null,
  definition    jsonb not null,
  status        text not null default 'live',  -- 'live' | 'incubating' | 'retired'
  lineage       jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists signals (
  id                 bigserial primary key,
  genome_id          text not null references genomes(id),
  symbol             text not null,
  triggered_at       timestamptz not null,
  trading_date       date not null,
  conviction         numeric not null,          -- logged as explicit probability basis
  evidence           jsonb not null,
  thesis_md          text,
  invalidation_price numeric not null,          -- NO SIGNAL EXISTS WITHOUT THIS
  time_stop_date     date not null,
  regime_at_trigger  text not null,
  regime_suppressed  boolean not null default false,  -- suppressed signals are scored too
  entry_price        numeric,                   -- next-session open, set by scorer
  status             text not null default 'pending_entry',
  unique (genome_id, symbol, trading_date)
);

create table if not exists signal_marks (
  signal_id     bigint not null references signals(id),
  mark_date     date not null,
  close         numeric,
  return_pct    numeric,
  spy_return_pct numeric,
  primary key (signal_id, mark_date)
);

-- ===== per-profile money layer =====

create table if not exists book (
  profile_id    text not null references profiles(id),
  symbol        text not null,
  exchange      text not null default 'NSE',
  kind          text not null,                 -- 'holding' | 'watchlist'
  qty           numeric,
  cost_basis    numeric,
  added_at      timestamptz not null default now(),
  -- Position-Intake plan (rescue mode): the retroactive trade plan for positions bought outside the system
  thesis        text,
  invalidation_price numeric,
  target_price  numeric,                        -- optional profit target; Watchtower prompts a protect-the-gain decision when hit
  time_stop_date date,
  primary key (profile_id, symbol, kind)
);

-- ===== India Archivist (A0.2) — point-in-time NSE data, keyed on the date inside each file =====
create table if not exists nse_equity (
  symbol        text not null,
  series        text not null,                 -- EQ, BE, SM, GS(bond)… keep so equities are separable
  trade_date    date not null,
  prev_close    numeric, open numeric, high numeric, low numeric, last_price numeric,
  close         numeric, avg_price numeric,
  volume        bigint,                          -- TTL_TRD_QNTY
  turnover_lacs numeric, num_trades bigint,
  deliv_qty     bigint,                          -- '-' for non-deliverable series → null
  deliv_per     numeric,                         -- crown jewel: delivery % (accumulation signal)
  primary key (symbol, series, trade_date)
);
create index if not exists nse_equity_date_idx on nse_equity (trade_date);
create index if not exists nse_equity_sym_idx on nse_equity (symbol, trade_date);

create table if not exists fii_dii_flows (
  trade_date    date not null,
  category      text not null,                   -- 'FII' | 'DII'
  buy_value numeric, sell_value numeric, net_value numeric,
  primary key (trade_date, category)
);

create table if not exists nse_fno_oi (            -- F&O open interest aggregated per underlying
  underlying text not null, trade_date date not null,
  futures_oi bigint, call_oi bigint, put_oi bigint, total_oi bigint,
  pcr numeric,                                     -- put/call OI ratio (sentiment gauge)
  futures_oi_chg bigint,
  primary key (underlying, trade_date)
);
create index if not exists nse_fno_oi_date_idx on nse_fno_oi (trade_date);

create table if not exists india_archive_runs (
  id bigserial primary key, ran_at timestamptz not null default now(),
  trade_date date, equity_rows int, fii_dii_rows int, status text, detail text
);

create table if not exists book_events (
  id            bigserial primary key,
  profile_id    text not null references profiles(id),
  symbol        text not null,
  kind          text not null,                 -- 'invalidation_hit' | 'time_stop' | 'filing' | 'si_spike' | 'earnings' | ...
  detected_at   timestamptz not null default now(),
  triage        text not null,                 -- 'fyi' | 'look' | 'decide'
  summary       text not null,
  source_ref    text
);

create table if not exists positions (
  id            bigserial primary key,
  profile_id    text not null references profiles(id),
  signal_id     bigint references signals(id),
  symbol        text not null,
  side          text not null default 'long',
  qty           numeric not null,
  entry_price   numeric not null,
  entry_at      timestamptz not null,
  risk_budget_pct numeric not null,            -- Treasury-computed, never chosen
  invalidation_price numeric not null,
  status        text not null default 'open',
  closed_at     timestamptz,
  realized_pnl  numeric
);

create table if not exists treasury_state (
  profile_id    text not null references profiles(id),
  date          date not null,
  equity        numeric not null,
  peak_equity   numeric not null,
  drawdown_pct  numeric not null,
  heat_pct      numeric not null,
  regime        text not null,
  sizing_multiplier numeric not null default 1.0,   -- 0.5 under dd_throttle_half, 0 under pause
  primary key (profile_id, date)
);

create table if not exists overrides (
  id            bigserial primary key,
  profile_id    text not null references profiles(id),
  position_id   bigint references positions(id),
  override_type text not null,                 -- 'skipped_exit' | 'oversized' | 'ignored_flag' | ...
  system_recommendation text not null,
  actual_action text not null,
  rationale     text,
  outcome_pnl   numeric                        -- filled when resolved; the honest number
);

-- ===== ops =====

create table if not exists job_runs (
  id            bigserial primary key,
  job           text not null,
  trading_date  date not null,
  status        text not null,                 -- 'ok' | 'error'
  started_at    timestamptz not null,
  ms            integer,
  meta          jsonb
);

create table if not exists routines (
  name          text primary key,
  enabled       boolean not null default true,
  master_paused boolean not null default false,
  last_run_at   timestamptz,
  next_run_at   timestamptz,
  last_summary  text
);

-- Receipts immutability: signals row content is frozen by convention + trigger.
create or replace function forbid_signal_mutation() returns trigger as $$
begin
  -- allow only status transitions and entry_price fill-in (scorer), never analytical fields
  if old.conviction is distinct from new.conviction
     or old.evidence is distinct from new.evidence
     or old.thesis_md is distinct from new.thesis_md
     or old.invalidation_price is distinct from new.invalidation_price
     or old.time_stop_date is distinct from new.time_stop_date
     or old.regime_at_trigger is distinct from new.regime_at_trigger
     or old.triggered_at is distinct from new.triggered_at then
    raise exception 'signals are immutable after freeze (guardrail 1)';
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists signals_immutable on signals;
create trigger signals_immutable before update on signals
  for each row execute function forbid_signal_mutation();
