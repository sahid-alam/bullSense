/** Telegram bot — the primary interface. No-ops gracefully until the token exists. */

export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "placeholder") {
    console.log(`[telegram dry-run → ${chatId}]\n${text}`);
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", disable_web_page_preview: true }),
  });
  if (!res.ok) console.error(`telegram send failed: HTTP ${res.status} ${await res.text()}`);
  return res.ok;
}
