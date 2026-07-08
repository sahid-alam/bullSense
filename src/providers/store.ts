/**
 * State persistence via Supabase REST (PostgREST) using the secret key.
 * No database password needed — works identically from a laptop and GitHub Actions.
 * All tables are RLS-locked; the secret key is the only way in besides direct pg.
 */

const base = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || url === "placeholder" || !key || key === "placeholder") return null;
  return { url: `${url}/rest/v1`, key };
};

export function storeAvailable(): boolean {
  return base() !== null;
}

async function rest(path: string, init: RequestInit & { preferUpsert?: boolean } = {}): Promise<any> {
  const b = base();
  if (!b) throw new Error("store not configured (SUPABASE_URL / SUPABASE_SECRET_KEY)");
  const headers: Record<string, string> = {
    apikey: b.key,
    Authorization: `Bearer ${b.key}`,
    "Content-Type": "application/json",
    Prefer: init.preferUpsert ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${b.url}/${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`store ${init.method ?? "GET"} ${path}: HTTP ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function upsertRegimeScore(row: {
  date: string; score: number; regime: string; components: object; narrative?: string | null; prev_score?: number | null;
}): Promise<void> {
  await rest("regime_scores?on_conflict=date", { method: "POST", body: JSON.stringify([row]), preferUpsert: true });
}

export async function getRecentRegimes(limit = 5): Promise<Array<{ date: string; score: number; regime: string }>> {
  return await rest(`regime_scores?select=date,score,regime&order=date.desc&limit=${limit}`, {
    method: "GET", headers: { Prefer: "return=representation" },
  }) ?? [];
}

export async function logJobRun(job: string, tradingDate: string, status: "ok" | "error", startedAtMs: number, meta: object): Promise<void> {
  await rest("job_runs", {
    method: "POST",
    body: JSON.stringify([{ job, trading_date: tradingDate, status, started_at: new Date(startedAtMs).toISOString(), ms: Date.now() - startedAtMs, meta }]),
  });
}

export async function routineEnabled(name: string): Promise<boolean> {
  const rows = await rest(`routines?select=enabled,master_paused&name=eq.${name}`, {
    method: "GET", headers: { Prefer: "return=representation" },
  });
  if (!rows || rows.length === 0) return true; // unknown routine → default on
  return rows[0].enabled && !rows[0].master_paused;
}

export async function touchRoutine(name: string, summary: string): Promise<void> {
  await rest(`routines?name=eq.${name}`, {
    method: "PATCH",
    body: JSON.stringify({ last_run_at: new Date().toISOString(), last_summary: summary }),
  });
}

export async function getProfiles(): Promise<Array<{ id: string; name: string; telegram_chat_id: string | null; equity: number; risk_prefs: any }>> {
  return await rest("profiles?select=id,name,telegram_chat_id,equity,risk_prefs", {
    method: "GET", headers: { Prefer: "return=representation" },
  }) ?? [];
}

export async function getBook(profileId: string): Promise<Array<{ symbol: string; exchange: string; kind: string; qty: number; cost_basis: number; invalidation_price: number | null; time_stop_date: string | null }>> {
  return await rest(`book?select=symbol,exchange,kind,qty,cost_basis,invalidation_price,time_stop_date&profile_id=eq.${profileId}`, {
    method: "GET", headers: { Prefer: "return=representation" },
  }) ?? [];
}
