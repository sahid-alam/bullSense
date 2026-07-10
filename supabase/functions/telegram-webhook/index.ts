// BullSense Telegram command console — Supabase Edge Function (Deno).
// Webhook target for @bullsense_desk_bot. Reads config + state directly from Postgres
// via the auto-injected SUPABASE_DB_URL, so no function secrets need manual setup.
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });

async function cfg(key: string): Promise<string | null> {
  const rows = await sql`select value from config where key = ${key}`;
  return rows[0]?.value ?? null;
}

async function reply(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
  });
}

const HELP = [
  "*BullSense commands* 🐂",
  "",
  "/status — engine heartbeat & job health",
  "/radar — today's market regime + read",
  "/book — your positions vs their stops",
  "/took `SYMBOL QTY [ENTRY]` — record that you traded a signal (tracks your P&L)",
  "/pnl — your realized P&L, win rate, and open positions",
  "/dossier `SYMBOL` — deep-dive research (fundamentals, bull/bear, verdict)",
  "/calibration — does higher conviction actually win more?",
  "/overrides — does overruling the system help or hurt?",
  "/add `SYM QTY COST [STOP]` — log a position you already own (Position Intake)",
  "/stop `SYMBOL PRICE` — set an invalidation (e.g. `/stop CUPID.NS 195`)",
  "/remove `SYMBOL` — drop a position from your book (e.g. after selling)",
  "/pause — halt new signals & alerts (archives keep running)",
  "/resume — resume the engine",
  "/help — this list",
].join("\n");

interface Profile { id: string; equity: number; risk_prefs: any }

async function isOperator(chatId: number): Promise<boolean> {
  const rows = await sql`select 1 from profiles where telegram_chat_id = ${String(chatId)} and is_operator = true limit 1`;
  return rows.length > 0;
}

/** The profile a command writes to: the operator profile for this chat, preferring the
 *  real named account over the shared 'test' sandbox when a chat maps to both. */
async function primaryProfileFor(chatId: number): Promise<Profile | null> {
  const rows = await sql`
    select id, equity, risk_prefs from profiles
    where telegram_chat_id = ${String(chatId)} and is_operator = true
    order by (id = 'test') asc, id limit 1`;
  return rows[0] ?? null;
}

/** Treasury Position-Intake verdict (mirrors src/lib/treasury.ts intakeVerdict). */
function intakeVerdict(equity: number, qty: number, cost: number, stop: number, riskMax: number) {
  const stopDist = cost - stop;
  const atRiskPct = (stopDist * qty) / equity;
  const maxQty = Math.floor((equity * riskMax) / Math.max(stopDist, 1e-9));
  const ratio = qty / Math.max(maxQty, 1);
  return { atRiskPct, maxQty, ratio, stopDist };
}

/** Treasury-suggested share count (mirrors src/lib/treasury.ts sizePosition core:
 *  conviction-scaled risk within band, capped by capital %). */
function treasurySuggestedQty(equity: number, conviction: number, entry: number, stop: number, prefs: any): number {
  const rmin = Number(prefs?.per_trade_risk_min ?? 0.01);
  const rmax = Number(prefs?.per_trade_risk_max ?? 0.025);
  const maxPos = Number(prefs?.max_position_pct ?? 0.25);
  const stopDist = entry - stop;
  if (stopDist <= 0) return 0;
  const c = Math.min(100, Math.max(0, conviction)) / 100;
  const riskPct = rmin + c * (rmax - rmin);
  const byRisk = Math.floor((equity * riskPct) / stopDist);
  const byCapital = Math.floor((equity * maxPos) / entry);
  return Math.max(0, Math.min(byRisk, byCapital));
}

async function handle(text: string, chatId: number): Promise<string> {
  const [cmdRaw, ...args] = text.trim().split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@\w+$/, "");

  // Every command exposes engine state or mutates it — restrict to known operators.
  // Unknown chats get a flat refusal (no data, no engine control, no /help enumeration).
  if (!(await isOperator(chatId))) {
    return "This is a private analyst. Access is restricted to its operators.";
  }

  if (cmd === "/start" || cmd === "/help") return HELP;

  if (cmd === "/status") {
    const routines = await sql`select name, enabled, master_paused, last_run_at, last_summary from routines order by name`;
    const errs = await sql`select count(*)::int as n from job_runs where started_at > now() - interval '24 hours' and status = 'error'`;
    const paused = routines.some((r) => r.master_paused);
    const lines = [`*Engine status* ${paused ? "⏸️ PAUSED" : "▶️ running"}`, ""];
    for (const r of routines) {
      const when = r.last_run_at ? new Date(r.last_run_at).toISOString().slice(5, 16).replace("T", " ") : "never";
      lines.push(`${r.enabled ? "✅" : "⛔"} *${r.name}* — ${when}\n   _${r.last_summary ?? "—"}_`);
    }
    lines.push("", errs[0].n === 0 ? "No job errors in 24h." : `⚠️ ${errs[0].n} job error(s) in 24h.`);
    return lines.join("\n");
  }

  if (cmd === "/radar") {
    const r = await sql`select date, score, regime, narrative from regime_scores order by date desc limit 1`;
    if (!r[0]) return "No Radar reading yet.";
    const label = r[0].regime === "risk_on" ? "🟢 RISK-ON" : r[0].regime === "neutral" ? "🟡 NEUTRAL" : "🔴 RISK-OFF";
    const heat = r[0].regime === "risk_on" ? "20%" : r[0].regime === "neutral" ? "12%" : "5%";
    return `*Market Radar* (${r[0].date})\nScore *${r[0].score}/100* → ${label}\nHeat ceiling: *${heat}*\n\n_${r[0].narrative ?? "—"}_`;
  }

  if (cmd === "/book") {
    const rows = await sql`
      select b.symbol, b.qty, b.cost_basis, b.invalidation_price, b.time_stop_date
      from book b join profiles p on p.id = b.profile_id
      where p.telegram_chat_id = ${String(chatId)} and b.kind = 'holding' and b.qty > 0
      order by b.symbol`;
    if (rows.length === 0) return "Your book is empty. Positions bought outside the system can be added later via Position Intake.";
    const lines = ["*Your Book*", ""];
    for (const b of rows) {
      const guard = b.invalidation_price ? `stop *${b.invalidation_price}*` : "⚠️ *no stop set*";
      const ts = b.time_stop_date ? ` · time-stop ${b.time_stop_date}` : "";
      lines.push(`*${b.symbol}* — ${b.qty} @ ${b.cost_basis} · ${guard}${ts}`);
    }
    lines.push("", "_Set a stop: /stop SYMBOL PRICE_");
    return lines.join("\n");
  }

  if (cmd === "/add") {
    // Position Intake: /add SYMBOL QTY COST [STOP]
    if (args.length < 3) return "Usage: `/add SYMBOL QTY COST [STOP]`\ne.g. `/add CUPID.NS 45 224.68 195`";
    const symbol = args[0].toUpperCase();
    const qty = Number(args[1]), cost = Number(args[2]);
    const stop = args[3] !== undefined ? Number(args[3]) : null;
    if (!isFinite(qty) || qty <= 0) return "QTY must be a positive number.";
    if (!isFinite(cost) || cost <= 0) return "COST must be a positive number.";
    if (stop !== null && (!isFinite(stop) || stop <= 0)) return "STOP must be a positive number.";
    const exchange = symbol.endsWith(".NS") ? "NSE" : "US";

    const profile = await primaryProfileFor(chatId);
    if (!profile) return "No profile found for you.";

    await sql`
      insert into book (profile_id, symbol, exchange, kind, qty, cost_basis, invalidation_price)
      values (${profile.id}, ${symbol}, ${exchange}, 'holding', ${qty}, ${cost}, ${stop})
      on conflict (profile_id, symbol, kind)
      do update set qty = ${qty}, cost_basis = ${cost},
        invalidation_price = coalesce(${stop}, book.invalidation_price)`;

    const lines = [`✅ *${symbol}* logged — ${qty} @ ${cost} (${profile.id}).`];
    if (stop !== null) {
      const riskMax = Number(profile.risk_prefs?.per_trade_risk_max ?? 0.025);
      const v = intakeVerdict(Number(profile.equity), qty, cost, stop, riskMax);
      if (v.stopDist <= 0) {
        lines.push(`Stop ${stop} is at/above cost — that locks a gain, not a loss cap.`);
      } else {
        lines.push(`Risk to stop ${stop}: *~${(v.stopDist * qty).toFixed(0)}* (${(v.atRiskPct * 100).toFixed(1)}% of equity).`);
        lines.push(v.ratio <= 1
          ? `Treasury: *within formula* (max ~${v.maxQty} shares at this stop). Well-sized.`
          : `Treasury: ⚠️ *oversized ${v.ratio.toFixed(1)}×* — the formula caps this at ~${v.maxQty} shares. You're carrying more risk than the rules allow.`);
      }
      lines.push("The Watchtower now guards it nightly.");
    } else {
      lines.push("⚠️ *No stop set.* An unguarded position is a hope, not a plan — set one:");
      lines.push(`\`/stop ${symbol} <price>\``);
    }
    return lines.join("\n");
  }

  if (cmd === "/took") {
    // Record a signal you actually traded: /took SYMBOL QTY [ENTRY]
    if (args.length < 2) return "Usage: `/took SYMBOL QTY [ENTRY]` — records a trade you took on a signal, so your P&L is tracked.";
    const symbol = args[0].toUpperCase();
    const qty = Number(args[1]);
    if (!isFinite(qty) || qty <= 0) return "QTY must be a positive number.";
    const profile = await primaryProfileFor(chatId);
    if (!profile) return "No profile found for you.";

    // link to the most recent signal for this symbol
    const sig = await sql`select id, invalidation_price, entry_price, conviction from signals where symbol = ${symbol} order by triggered_at desc limit 1`;
    if (sig.length === 0) return `No signal on record for *${symbol}*. Use /add for a manual (non-signal) position.`;
    const s = sig[0];
    const entry = args[2] !== undefined ? Number(args[2]) : Number(s.entry_price);
    if (!isFinite(entry) || entry <= 0) return "ENTRY must be a positive number (or the signal must have a filled entry).";

    const riskBudgetPct = (Math.abs(entry - Number(s.invalidation_price)) * qty) / profile.equity;
    const posRows = await sql`
      insert into positions (profile_id, signal_id, symbol, side, qty, entry_price, entry_at, risk_budget_pct, invalidation_price, status)
      values (${profile.id}, ${s.id}, ${symbol}, 'long', ${qty}, ${entry}, now(), ${riskBudgetPct}, ${Number(s.invalidation_price)}, 'open')
      returning id`;

    // Override receipt: did you size materially off the Treasury's suggestion?
    const suggested = treasurySuggestedQty(Number(profile.equity), Number(s.conviction), entry, Number(s.invalidation_price), profile.risk_prefs);
    let overrideNote = "";
    if (suggested > 0 && Math.abs(qty - suggested) / suggested > 0.5) {
      const kind = qty > suggested ? "oversized" : "undersized";
      await sql`
        insert into overrides (profile_id, position_id, override_type, system_recommendation, actual_action)
        values (${profile.id}, ${posRows[0].id}, ${kind}, ${'Treasury size ' + suggested + ' shares'}, ${'took ' + qty + ' shares'})`;
      overrideNote = `\n⚠️ *${kind.toUpperCase()}*: Treasury suggested ~${suggested} shares; you took ${qty}. Logged — /overrides tracks whether this helps or hurts.`;
    }

    return `✅ Recorded: you took *${symbol}* — ${qty} @ ${entry} (${profile.id}).\n` +
      `Risk to invalidation ${s.invalidation_price}: ~${(Math.abs(entry - Number(s.invalidation_price)) * qty).toFixed(0)} (${(riskBudgetPct * 100).toFixed(1)}% of equity).${overrideNote}\n` +
      `Your P&L on this trade is now tracked vs the engine's — see /pnl.`;
  }

  if (cmd === "/dossier") {
    if (!args[0]) return "Usage: `/dossier SYMBOL` — a deep-dive research dossier (fundamentals, filings, bull vs bear, verdict). US tickers.";
    const symbol = args[0].toUpperCase();
    // serve a fresh cached dossier instantly
    const cached = await sql`select summary_md from dossiers where symbol = ${symbol} and created_at > now() - interval '3 days' order by created_at desc limit 1`;
    if (cached.length) return cached[0].summary_md + "\n\n_(cached · ask again in 3+ days for a fresh build)_";
    // otherwise queue a build (avoid duplicate queued rows)
    const pending = await sql`select 1 from dossier_requests where symbol = ${symbol} and status = 'queued' limit 1`;
    if (pending.length === 0) {
      await sql`insert into dossier_requests (symbol, requested_by, chat_id) values (${symbol}, ${String(chatId)}, ${String(chatId)})`;
    }
    return `🔬 Dossier queued for *${symbol}*. The Analyst Desk is researching — the full write-up arrives here shortly.`;
  }

  if (cmd === "/calibration") {
    const closed = await sql`
      select
        case when conviction < 55 then '40-55' when conviction < 65 then '55-65'
             when conviction < 75 then '65-75' else '75-100' end as band,
        count(*) as n,
        count(*) filter (where m.ret > 0) as wins,
        round(avg(m.ret)::numeric, 1) as avg_ret
      from signals s
      join lateral (select return_pct as ret from signal_marks where signal_id = s.id order by mark_date desc limit 1) m on true
      where s.status like 'closed_%'
      group by 1 order by 1`;
    if (closed.length === 0) return "*Calibration*\n\n_No closed signals yet. This table fills as signals resolve — it will show whether higher conviction actually means a higher win rate._";
    const lines = ["*Calibration* — conviction band → actual win rate", ""];
    for (const r of closed) {
      const wr = Number(r.n) > 0 ? Math.round((Number(r.wins) / Number(r.n)) * 100) : 0;
      lines.push(`conviction *${r.band}*: ${wr}% win (${r.wins}/${r.n}), avg ${r.avg_ret}%`);
    }
    lines.push("", "_Well-calibrated = win rate rises with conviction band._");
    return lines.join("\n");
  }

  if (cmd === "/overrides") {
    const profile = await primaryProfileFor(chatId);
    if (!profile) return "No profile found for you.";
    const rows = await sql`
      select override_type, count(*) as n, coalesce(sum(outcome_pnl),0) as pnl,
        count(*) filter (where outcome_pnl is null) as pending
      from overrides where profile_id = ${profile.id} group by 1 order by 1`;
    if (rows.length === 0) return "*Override receipts*\n\n_None yet. When you size off the Treasury's suggestion or overrule an exit, it's logged here — and scored, so you get an honest answer on whether your discretion helps or hurts._";
    const lines = ["*Override receipts* — does overruling the system pay?", ""];
    for (const r of rows) {
      const resolved = Number(r.n) - Number(r.pending);
      lines.push(`*${r.override_type}*: ${r.n} total${resolved > 0 ? `, scored P&L ${Number(r.pnl) >= 0 ? "+" : ""}${Math.round(Number(r.pnl))}` : ""}${Number(r.pending) > 0 ? ` (${r.pending} still open)` : ""}`);
    }
    return lines.join("\n");
  }

  if (cmd === "/pnl") {
    const profile = await primaryProfileFor(chatId);
    if (!profile) return "No profile found for you.";
    const closed = await sql`select coalesce(sum(realized_pnl),0) as realized, count(*) filter (where realized_pnl > 0) as wins, count(*) as n from positions where profile_id = ${profile.id} and status = 'closed'`;
    const open = await sql`select count(*) as n from positions where profile_id = ${profile.id} and status = 'open'`;
    const ts = await sql`select equity, drawdown_pct from treasury_state where profile_id = ${profile.id} order by date desc limit 1`;
    const c = closed[0];
    const wr = Number(c.n) > 0 ? `${((Number(c.wins) / Number(c.n)) * 100).toFixed(0)}%` : "—";
    const lines = [`*Your P&L* (${profile.id})`, ""];
    if (ts[0]) lines.push(`Equity: *${Math.round(Number(ts[0].equity))}* (drawdown ${(Number(ts[0].drawdown_pct) * 100).toFixed(1)}%)`);
    lines.push(`Realized: *${Number(c.realized) >= 0 ? "+" : ""}${Math.round(Number(c.realized))}* over ${c.n} closed`);
    lines.push(`Win rate: ${wr} · ${open[0].n} open`);
    if (Number(c.n) === 0 && Number(open[0].n) === 0) lines.push("", "_No tracked trades yet. When you act on a signal, log it with /took._");
    return lines.join("\n");
  }

  if (cmd === "/remove") {
    if (args.length < 1) return "Usage: `/remove SYMBOL`";
    const symbol = args[0].toUpperCase();
    const deleted = await sql`
      delete from book b using profiles p
      where b.profile_id = p.id and p.telegram_chat_id = ${String(chatId)}
        and b.symbol = ${symbol} and b.kind = 'holding'
      returning b.symbol`;
    return deleted.length > 0
      ? `🗑️ Removed *${symbol}* from your book.`
      : `No holding *${symbol}* found in your book.`;
  }

  if (cmd === "/stop") {
    if (args.length < 2) return "Usage: `/stop SYMBOL PRICE` — e.g. `/stop CUPID.NS 195`";
    const symbol = args[0].toUpperCase();
    const price = Number(args[1]);
    if (!isFinite(price) || price <= 0) return "Price must be a positive number.";
    const updated = await sql`
      update book b set invalidation_price = ${price}
      from profiles p
      where b.profile_id = p.id and p.telegram_chat_id = ${String(chatId)}
        and b.symbol = ${symbol} and b.kind = 'holding'
      returning b.profile_id, b.qty, b.cost_basis`;
    if (updated.length === 0) return `No holding *${symbol}* found in your book. Check the symbol (NSE names end in .NS).`;
    const u = updated[0];
    const riskPerShare = Number(u.cost_basis) - price;
    const riskNote = riskPerShare > 0
      ? `Risk to stop: ~${(riskPerShare * Number(u.qty)).toFixed(0)} (${((riskPerShare / Number(u.cost_basis)) * 100).toFixed(1)}% from cost).`
      : `Note: stop is above your cost — this locks in a gain rather than capping a loss.`;
    return `✅ Stop set on *${symbol}* at *${price}*. ${riskNote}\nThe Watchtower now guards it nightly.`;
  }

  if (cmd === "/pause" || cmd === "/resume") {
    const paused = cmd === "/pause";
    await sql`update routines set master_paused = ${paused}`;
    return paused
      ? "⏸️ *Engine paused.* No new signals or alerts will fire. Archives keep running — the analyst sleeps, its memory doesn't."
      : "▶️ *Engine resumed.* Signals and alerts are live again.";
  }

  return `Unrecognized command. ${HELP}`;
}

Deno.serve(async (req) => {
  const token = await cfg("telegram_bot_token");
  const secret = await cfg("telegram_webhook_secret");
  if (!token) return new Response("not configured", { status: 500 });

  // Fail CLOSED: if the webhook secret is missing, refuse to serve rather than
  // silently skipping verification. Then require the header to match exactly.
  if (!secret) return new Response("webhook secret not configured", { status: 500 });
  if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  let update: any;
  try { update = await req.json(); } catch { return new Response("ok"); }
  const msg = update?.message ?? update?.edited_message;
  const chatId = msg?.chat?.id;
  const text = msg?.text;
  if (!chatId || !text) return new Response("ok");

  try {
    const out = await handle(text, chatId);
    await reply(token, chatId, out);
  } catch (e) {
    // Log detail server-side; never reflect DB/internal error text to the user.
    console.error("handler error:", e);
    await reply(token, chatId, "⚠️ Something went wrong handling that. Try again shortly.");
  }
  return new Response("ok");
});
