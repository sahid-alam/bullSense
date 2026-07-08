/**
 * One-time helper: after creating the bot with @BotFather and each person has
 * sent it any message, run `npm run setup:telegram` — it prints every chat id
 * the bot has seen, ready to paste into config/profiles.json.
 */
const token = process.env.TELEGRAM_BOT_TOKEN;

async function main() {
  if (!token || token === "placeholder") {
    console.log("Set TELEGRAM_BOT_TOKEN in .env first (get it from @BotFather → /newbot).");
    process.exit(1);
  }
  const me = await (await fetch(`https://api.telegram.org/bot${token}/getMe`)).json() as any;
  if (!me.ok) {
    console.error("Token rejected by Telegram:", me.description);
    process.exit(1);
  }
  console.log(`Bot connected: @${me.result.username}\n`);

  const updates = await (await fetch(`https://api.telegram.org/bot${token}/getUpdates`)).json() as any;
  const seen = new Map<string, string>();
  for (const u of updates.result ?? []) {
    const chat = u.message?.chat;
    if (chat) seen.set(String(chat.id), `${chat.first_name ?? ""} ${chat.last_name ?? ""} (@${chat.username ?? "no-username"})`.trim());
  }
  if (seen.size === 0) {
    console.log(`No messages yet. Each person should open Telegram, search @${me.result.username}, press Start, send "hi" — then rerun this.`);
    return;
  }
  console.log("Chat IDs seen (paste into config/profiles.json → telegram_chat_id):");
  for (const [id, who] of seen) console.log(`  ${id}  →  ${who}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
