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
  "/stop `SYMBOL PRICE` — set an invalidation (e.g. `/stop CUPID.NS 195`)",
  "/pause — halt new signals & alerts (archives keep running)",
  "/resume — resume the engine",
  "/help — this list",
].join("\n");

async function handle(text: string, chatId: number): Promise<string> {
  const [cmdRaw, ...args] = text.trim().split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/@\w+$/, "");

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
  if (!token) return new Response("no token", { status: 500 });

  // verify the request really came from Telegram
  if (secret && req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
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
    await reply(token, chatId, `⚠️ Error: ${String(e).slice(0, 200)}`);
  }
  return new Response("ok");
});
