// A BenchAgent whose decisions come from a participant-supplied HTTP webhook. The engine calls
// decide() per step; RemoteAgent POSTs the MarketContext to the webhook (through the SSRF-safe
// client) and parses an AgentDecision back. It never crashes the run: any timeout, transport
// error, non-2xx, malformed body, or out-of-range field degrades safely to a recorded `hold`,
// and the failure is surfaced via onError so a caller can enforce an error budget. Decisions are
// clamped before they reach the guardrail (defense in depth). The webhook host is resolved and
// pinned on first use, so it cannot rebind to an internal address mid-run.

import type {
  BenchAgent,
  MarketContext,
  AgentDecision,
  AgentResponseMeta,
  ResponseReportingAgent,
} from "@bitgetbench/core";
import {
  assertWebhookUrlAllowed,
  safePostJson,
  type PinnedTarget,
  type SafePostResult,
} from "./safeFetch.js";

/** Defense-in-depth cap on leverage before the guardrail; the guardrail policy clamps further. */
const MAX_REMOTE_LEVERAGE = 50;
const MAX_RATIONALE = 280;
const ACTIONS = new Set(["long", "short", "close", "hold"]);

export interface RemoteAgentOptions {
  name: string;
  webhookUrl: string;
  /** Run/job id, echoed to the webhook so it can correlate calls. */
  runId: string;
  /** Per-call timeout in ms. Default 4000. */
  timeoutMs?: number;
  /** Retries on transport error or 5xx. Default 1. */
  retries?: number;
  /** Absolute wall-clock deadline (epoch ms). Past it, every step short-circuits to a recorded
   * hold without calling the webhook, so a slow or dead endpoint cannot run the backtest for an
   * unbounded time (the per-step timeout alone would still allow timeout x window). */
  deadlineMs?: number;
  /** Called on every failed step with the reason, for error-budget tracking. */
  onError?: (step: number, reason: string) => void;
}

function holdDecision(symbol: string, reason: string): AgentDecision {
  return { action: "hold", symbol, sizePct: 0, rationale: `remote agent: ${reason}` };
}

export class RemoteAgent implements BenchAgent, ResponseReportingAgent {
  readonly name: string;
  private readonly opts: RemoteAgentOptions;
  private step = 0;
  private errors = 0;
  private pinned: PinnedTarget | null = null;
  private lastResponse: AgentResponseMeta | undefined;

  constructor(opts: RemoteAgentOptions) {
    this.name = opts.name;
    this.opts = opts;
  }

  /** Steps that failed and fell back to hold. */
  get errorCount(): number {
    return this.errors;
  }

  consumeLastResponse(): AgentResponseMeta | undefined {
    const r = this.lastResponse;
    this.lastResponse = undefined;
    return r;
  }

  async decide(ctx: MarketContext): Promise<AgentDecision> {
    const step = this.step;
    this.step += 1;
    if (this.opts.deadlineMs !== undefined && Date.now() > this.opts.deadlineMs) {
      // Past the wall-clock budget: stop calling the webhook entirely. Count as an error so the
      // error budget trips and the agent is marked failed / auto-disabled.
      const reason = "run deadline exceeded";
      this.errors += 1;
      this.lastResponse = { raw: { error: reason }, latencyMs: 0, httpStatus: 0 };
      this.opts.onError?.(step, reason);
      return holdDecision(ctx.symbol, reason);
    }
    try {
      if (!this.pinned) this.pinned = await assertWebhookUrlAllowed(this.opts.webhookUrl);
      const res = await this.postWithRetry(ctx, step);
      this.lastResponse = {
        raw: res.json,
        latencyMs: Math.round(res.latencyMs),
        httpStatus: res.status,
      };
      return this.parse(res.json, ctx);
    } catch (err) {
      const reason = (err as Error).message;
      this.errors += 1;
      this.lastResponse = { raw: { error: reason }, latencyMs: 0, httpStatus: 0 };
      this.opts.onError?.(step, reason);
      return holdDecision(ctx.symbol, reason);
    }
  }

  private async postWithRetry(ctx: MarketContext, step: number): Promise<SafePostResult> {
    const attempts = (this.opts.retries ?? 1) + 1;
    const body = { version: 1, runId: this.opts.runId, step, context: ctx };
    const postOpts: { timeoutMs?: number } =
      this.opts.timeoutMs !== undefined ? { timeoutMs: this.opts.timeoutMs } : {};
    let lastErr: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        const res = await safePostJson(this.pinned!, body, postOpts);
        // Retry only on 5xx; 4xx is a client contract error and should not be hammered.
        if (res.status >= 500) throw new Error(`webhook returned ${res.status}`);
        if (res.status < 200 || res.status >= 300) {
          throw new Error(`webhook returned non-2xx status ${res.status}`);
        }
        return res;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("webhook call failed");
  }

  /** Validate and clamp the webhook body into a safe AgentDecision. Throws on bad shape. */
  private parse(json: unknown, ctx: MarketContext): AgentDecision {
    if (!json || typeof json !== "object") throw new Error("webhook body was not an object");
    const o = json as Record<string, unknown>;
    const action = String(o.action);
    if (!ACTIONS.has(action)) throw new Error(`unknown action "${action}"`);

    const sizePctRaw = typeof o.sizePct === "number" && Number.isFinite(o.sizePct) ? o.sizePct : 0;
    const sizePct = Math.max(0, Math.min(1, sizePctRaw));

    const decision: AgentDecision = {
      action: action as AgentDecision["action"],
      symbol: ctx.symbol, // never trade a different symbol than the run window
      sizePct,
      rationale: typeof o.rationale === "string" ? o.rationale.slice(0, MAX_RATIONALE) : "",
    };

    if (typeof o.leverage === "number" && Number.isFinite(o.leverage)) {
      decision.leverage = Math.max(1, Math.min(MAX_REMOTE_LEVERAGE, o.leverage));
    }
    if (typeof o.confidence === "number" && Number.isFinite(o.confidence)) {
      decision.confidence = Math.max(0, Math.min(1, o.confidence));
    }
    return decision;
  }
}
