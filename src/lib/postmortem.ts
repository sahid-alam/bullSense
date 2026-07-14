/**
 * Trade post-mortems (A2) — every closed position auto-examined: was the thesis right or
 * lucky, was the exit plan followed, which guards fired. Deterministic, not LLM-decided —
 * classified from realized P&L and the actual Watchtower events logged during the hold,
 * same "narrate/classify, never decide" discipline as the rest of the engine.
 *
 * HONEST SCOPE: at A2 build time there is exactly one closed position system-wide, so this
 * machinery runs against near-zero real data. That's expected, not a bug — it accrues one
 * post-mortem per closed trade going forward, same as the freeze-and-score discipline
 * everywhere else in the project.
 */
import { closedPositionsNeedingPostmortem, guardEventsInWindow, insertPostmortem } from "../providers/store.js";

export type ThesisVerdict = "right" | "lucky" | "wrong" | "unclear";

export interface ClosedPosition {
  symbol: string; qty: number; entryPrice: number; invalidationPrice: number | null;
  realizedPnl: number | null; signalId: number | null;
}
export interface GuardEvent { kind: string; detectedAt: string }

export interface Postmortem {
  thesisVerdict: ThesisVerdict;
  exitFollowedPlan: boolean | null; // null = no plan-triggered event found either way (manual exit, no guard on record)
  guardsFired: string[];
  summary: string;
}

const PLAN_EXIT_KINDS = new Set(["invalidation_hit", "time_stop", "target_hit"]);

export function analyzePostmortem(pos: ClosedPosition, events: GuardEvent[]): Postmortem {
  const guardsFired = [...new Set(events.map((e) => e.kind))];
  const planEvent = events.find((e) => PLAN_EXIT_KINDS.has(e.kind));
  const exitFollowedPlan = planEvent ? true : (guardsFired.length > 0 ? false : null);
  const profitable = (pos.realizedPnl ?? 0) > 0;

  let thesisVerdict: ThesisVerdict;
  let reason: string;

  if (pos.signalId === null) {
    thesisVerdict = "unclear";
    reason = "manual position (Position Intake, not a signal) — no thesis on record to grade";
  } else if (profitable && planEvent?.kind === "target_hit") {
    thesisVerdict = "right";
    reason = "profitable and closed on a hit target — the thesis played out as planned";
  } else if (profitable && planEvent?.kind === "time_stop") {
    thesisVerdict = "lucky";
    reason = "profitable, but the thesis's own clock ran out (time-stop) — the profit is incidental to survival, not confirmation of the thesis";
  } else if (profitable && !planEvent) {
    thesisVerdict = "lucky";
    reason = "profitable, but the exit was discretionary — not tied to the plan (target/stop/time-stop), so the thesis can't be credited cleanly";
  } else if (!profitable && planEvent?.kind === "invalidation_hit") {
    thesisVerdict = "wrong";
    reason = "closed at a loss on a hit stop — the thesis failed, but the guard did its job";
  } else if (!profitable) {
    thesisVerdict = "wrong";
    reason = planEvent ? `closed at a loss on ${planEvent.kind}` : "closed at a loss with no plan-triggered event on record";
  } else {
    thesisVerdict = "unclear";
    reason = "outcome didn't match a recognized pattern — flagged for manual review";
  }

  return {
    thesisVerdict,
    exitFollowedPlan,
    guardsFired,
    summary: `${pos.symbol}: ${thesisVerdict.toUpperCase()} — ${reason}.` + (guardsFired.length ? ` Guards on record: ${guardsFired.join(", ")}.` : " No guard events on record."),
  };
}

/** Scan closed positions without a post-mortem yet, classify each, and freeze the record. */
export async function runPostmortems(): Promise<{ examined: number }> {
  const positions = await closedPositionsNeedingPostmortem();
  let examined = 0;
  for (const pos of positions) {
    const to = pos.closedAt ?? new Date().toISOString();
    const events = await guardEventsInWindow(pos.profileId, pos.symbol, pos.entryAt, to);
    const pm = analyzePostmortem(
      { symbol: pos.symbol, qty: pos.qty, entryPrice: pos.entryPrice, invalidationPrice: pos.invalidationPrice, realizedPnl: pos.realizedPnl, signalId: pos.signalId },
      events.map((e) => ({ kind: e.kind, detectedAt: e.detected_at })),
    );
    await insertPostmortem({
      position_id: pos.id, profile_id: pos.profileId, symbol: pos.symbol,
      thesis_verdict: pm.thesisVerdict, exit_followed_plan: pm.exitFollowedPlan, guards_fired: pm.guardsFired, summary: pm.summary,
    });
    examined++;
  }
  return { examined };
}
